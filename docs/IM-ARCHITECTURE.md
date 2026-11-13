# CloseCrab IM implementation boundary

CloseCrab IM is a separate product surface from the local Agent bridge. The bridge continues to handle a user's private desktop session; IM handles authenticated users, relationships, conversations and shared content.

## Product areas

- **Direct messages and groups:** durable messages, delivery/read state, replies, reactions, edits and deletion tombstones.
- **Friends:** search by stable user handle, request/accept/block, mute and per-conversation permissions.
- **Community feed:** posts with text, images, video and audio, comments, reactions, reposts and visibility (`private`, `friends`, `group`, `public`).
- **Calls:** WebRTC audio/video with an authenticated signaling channel. Media does not pass through the Agent process.
- **Agent rooms:** a user explicitly invites an Agent to a conversation or selects individual messages/files. The Agent receives a time-limited, redacted context grant.

## Agent data boundary

The Agent cannot enumerate a user's friends, feed, files, messages or microphone by default. Each grant records the room, requested scopes, selected message/file IDs, expiry, and revocation time. Supported scopes are `messages.read`, `attachments.read`, `community.read`, `contacts.read` and `call.transcript.read`; calls and microphone access require a separate foreground user action. Every Agent retrieval is audit logged.

## Transport and storage

- REST for authentication, relationship changes, feed queries and uploads.
- WebSocket for message delivery, presence, typing, receipts and call signaling; reconnect uses a cursor and idempotency key.
- PostgreSQL for durable metadata and message rows; S3-compatible object storage for encrypted attachments; Redis only for fan-out/presence and short-lived locks.
- WebRTC with STUN and TURN for voice/video. TURN credentials are short-lived and scoped to a call.
- Uploads use short-lived presigned URLs, MIME/size limits, antivirus/media inspection and generated thumbnails. Clients never trust a filename or content type.

## Delivery guarantees

Clients send a UUID idempotency key. The server stores it with the message transaction, so retries cannot duplicate messages. WebSocket events carry a monotonically increasing conversation cursor. Reconnect requests replay from the last acknowledged cursor; expired cursors force a paginated history sync.

## Delivery order

1. Backend migrations and authenticated REST/WS contract.
2. Desktop account/session identity and mobile IM shell.
3. Direct and group chat with offline sync.
4. Attachment upload, feed and moderation controls.
5. Agent room invitations and scoped retrieval/audit log.
6. WebRTC calls and optional user-approved transcription.

The first production milestone is direct/group chat with durable sync and explicit Agent invitations. Friends, feed, media and calls then reuse the same identity, conversation, attachment and permission primitives.
