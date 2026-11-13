# CloseCrab IM interface

## Desktop

The IM area is a first-level destination beside Studio, Commands and Mobile access. Its left rail has five destinations:

1. **消息** — direct messages, groups and unread counts.
2. **好友** — requests, contacts, blocked users and search.
3. **社区** — feed, topic filters and post composer.
4. **通话** — active calls and call history.
5. **Agent 房间** — conversations where the user explicitly invited an Agent.

The center column is the active list or timeline. The main column is the conversation/feed. A context rail shows members, shared media, permissions and Agent access. Context rails collapse below 1100px; they never cover the composer.

## Mobile

The bottom navigation is fixed above the safe-area inset: `消息`, `好友`, `社区`, `通话`, `我的`. A conversation uses a compact header, scrollable timeline and a composer that supports text, image/video attachment, voice message and call. Voice recording has a visible timer and cancel gesture. A call uses a full-screen stage with a clear mute, camera, speaker and hang-up control.

## Message states

Every message has a pending, sent, delivered, read, failed or deleted visual state. Failed messages retain their content and provide retry. Reconnect shows a small state banner and resumes from the last cursor; it never silently duplicates history.

## Agent room

The Agent is shown as a member with a distinct color and badge. An invitation sheet explains the scopes before confirmation:

- selected messages
- attachments in this room
- community posts explicitly shared here
- call transcript (off by default)

The composer displays the active scopes beside the send button. A user can revoke access from the room header. Agent answers, tool activity and human messages use separate visual treatments, while all remain in one chronological timeline.

## Media and privacy

Attachments show upload progress, retry and cancel. Video and image previews are generated locally before upload where possible. A post composer always shows its audience (`仅自己`, `好友`, `群组`, `公开`) beside the publish action. The Agent cannot see a feed or contact list from the IM UI unless the user selects and shares it.

## Responsive rules

- Touch targets are at least 44px.
- No modal is required for normal message sending, media preview or switching conversations.
- Long names and URLs ellipsize, while message bodies wrap.
- Keyboard, screen reader labels, reduced motion and high contrast are supported.
