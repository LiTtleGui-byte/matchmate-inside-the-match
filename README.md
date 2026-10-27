# MatchMate — Inside the Match

MatchMate is a football viewing companion that helps viewers understand key moments while watching a match. Built for the Microsoft + Premier League **Inside the Game: Developer Hackathon**.

[Try MatchMate](https://inside.matchmate.chat/) · [Watch the demo](https://youtu.be/rexVN0ve7eM)

## Experience

- Watch a recorded match in a live-like flow, with playback, replay and a return to your saved viewing position.
- Receive a quiet invitation to explain a key event in the conversation.
- Read a concise explanation, inspect supporting match records and ask follow-up questions about the same moment.
- Choose match statistics, charts and players to keep in view; explore lineups and individual player details.
- Personalize football experience level, team preference and commentary style.
- Switch between light and dark themes, resize the video and conversation panels, and use the responsive mobile layout.
- Optionally search the latest web information. These results can reveal later events or the result of the match.

## Run locally

Requirements: **Python 3.10+** and a modern browser supporting JavaScript modules. No package installation or build step is required.

```sh
cp .env.example .env
python3 tools/serve.py
```

Open **http://localhost:5173**. Use `--port 5174` to choose another local port.

The interface, themes, panel resizing and preference controls can be explored immediately. Playback, match records and answers require a configured match service and authorized media. With no service URL, the interface displays a connection notice and makes no match or model requests.

## Configuration

Set the following public URLs in `.env` or environment variables, then restart the local preview:

| Variable | Purpose |
| --- | --- |
| `MATCHMATE_API_BASE_URL` | Base URL of a compatible match service. |
| `MATCHMATE_MEDIA_URL` | Authorized HLS master playlist URL. If blank, the client uses the session's media URL. |
| `MATCHMATE_LINEUPS_URL` | URL providing the lineup display information. |

These values are delivered to the browser. Use public URLs without passwords, API keys or signed query parameters. The local preview exposes only `web/` and the three URL settings, and binds to localhost.

The client uses session, match-state, match-data and explanation HTTP endpoints. Cross-origin services must allow the client origin and credentialed requests. Session cookies must be compatible with the browser's cross-site cookie policy. Relative URLs in HLS playlists must resolve to authorized media resources with the required browser access permissions.

For static hosting, serve `web/` with a `/client-config.json` document containing `apiBaseURL`, `mediaURL` and `lineupsURL`. Local preferences are saved in the browser.

## Technology

HTML, CSS and native JavaScript modules; **hls.js 1.6.16** for compatible HLS playback; browser speech recognition and speech synthesis where supported. The local preview uses the Python standard library.

## Data and media

Use match records, lineup information, player images and video only with appropriate access and redistribution rights. The hosted demonstration uses a recorded match; its footage and match records are real, not synthetic. Timing and metric availability depend on the connected sources. Team initials in this client are text-based marks.

## Rights and acknowledgements

MatchMate materials: all rights reserved. Third-party components retain their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
