# Contributing to CloseCrab-Web

Thanks for your interest! Here's how to contribute.

## Quick Start

```bash
git clone https://github.com/Blitzball996/CloseCrab-Web.git
cd CloseCrab-Web
npm install
node bin/cli.js --port 3000
```

## What We Need Help With

- **Mobile UX** — Improve touch interactions, test on different phones
- **New mini-games** — Add games to the loading screen (see `lib/web/games.js`)
- **Bug reports** — Especially iOS Safari and Android Chrome issues
- **Themes** — Dark/light mode, custom color schemes
- **i18n** — Translations for the web UI

## Code Style

- Vanilla JS (no framework), keep it lightweight
- Mobile-first CSS
- No build step — files are served directly

## Pull Request Process

1. Fork and branch from `main`
2. Test on a real phone (or Chrome DevTools mobile emulation)
3. Submit PR with screenshots if it's a UI change

## License

MIT — contributions are licensed under the same terms.
