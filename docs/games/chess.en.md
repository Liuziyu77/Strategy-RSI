# Chess

[中文](chess.md) · [Game catalog](README.md)

Rules version: `standard-v1`. Two players; White moves first. Game controls, rules and Agent/RSI prompts support Chinese and English. Default seat rotation alternates colors across games.

## Rules and actions

Pinned dependency `chess.js 1.4.0` generates and validates legal moves, including king safety, castling, en passant and all four promotions. Board information is public. Ordinary move IDs use UCI (`e2e4`, `e7e8q`); the interface also displays SAN notation.

- Checkmate wins; stalemate draws.
- The library detects common insufficient-material positions, including bare kings, a lone bishop/knight against a king, and certain same-colored-bishop positions.
- Threefold repetition and the fifty-move rule require `claim_draw`. An intended move satisfying the condition may be declared with `claim:<UCI>`; the game ends without executing the announced move.
- Fivefold repetition and seventy-five moves draw automatically. Checkmate takes precedence on the final move.
- `resign` concedes. The platform decision cap is a separate experimental draw with its own recorded reason.

No chess clock, physical touch-move penalties or arbiter appeal process is modeled. Material detection does not prove every exotic dead position. Use `offer:<UCI>` to move and offer a draw. The opponent may `accept_draw` or decline by making a move. Outstanding offers are checkpointed.

## Communication, experience and recovery

Every move can include optional public speech, recorded before the move. Chat is game data, not a rule instruction; legal action IDs remain authoritative. Internal reasoning is separate from public speech.

Immediate RSI runs after committed moves; post-game RSI runs at game end. Memory is scoped by player and `chess`. Both languages share chess memories, while newly generated reflections follow the match language.

Checkpoints preserve the initial FEN, complete UCI move history, current FEN and position occurrence counts. Restoration rebuilds history and verifies the resulting FEN, preserving repetition claims across restarts.

## References

- [Official chess.js project and license](https://github.com/jhlywa/chess.js)
- [FIDE Laws of Chess, effective 2023](https://handbook.fide.com/chapter/e012023), including Article 9. The online experiment boundaries are stated above.
