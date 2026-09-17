# Chess

[中文](chess.md) · [Game catalog](README.md)

Rules version: `standard-v1`. Two players; White moves first. Game controls, rules and Agent/RSI prompts support Chinese and English. Default seat rotation alternates colors across games.

## Rules and actions

The engine uses `chess.js 1.4.0` to generate and validate legal moves, including king safety, castling, en passant and all four promotions. Board information is public. Ordinary move IDs use UCI (`e2e4`, `e7e8q`); the interface also displays SAN notation.

- Checkmate wins; stalemate draws.
- The library detects common insufficient-material positions, including bare kings, a lone bishop/knight against a king, and certain same-colored-bishop positions.
- Threefold repetition and the fifty-move rule require `claim_draw`. An intended move satisfying the condition may be declared with `claim:<UCI>`; the game ends without executing the announced move.
- Fivefold repetition and seventy-five moves draw automatically. Checkmate takes precedence on the final move.
- `resign` concedes. The platform decision cap is a separate experimental draw with its own recorded reason.

Use `offer:<UCI>` to move and offer a draw. The opponent may choose `accept_draw` or decline by making a move. Outstanding offers are saved in checkpoints.

This version has no chess clock, physical touch-move penalties or arbiter appeals. The library's material detection cannot identify every rare dead position.

## Communication, experience and recovery

Every move can include public speech, recorded before the move. Speech does not execute rule commands: players still need to select an action ID supplied by the engine. Decision reasons are kept out of public chat.

Immediate RSI runs after committed moves; post-game RSI runs at game end. Memory is scoped by player and `chess`. Both languages share chess memories, while newly generated reflections follow the match language.

Checkpoints preserve the initial FEN, complete UCI move history, current FEN and position occurrence counts. Restoration rebuilds history and verifies the resulting FEN, preserving repetition claims across restarts.

## References

- [Official chess.js project and license](https://github.com/jhlywa/chess.js)
- [FIDE Laws of Chess, effective 2023](https://handbook.fide.com/chapter/e012023), including Article 9. The online experiment boundaries are stated above.
