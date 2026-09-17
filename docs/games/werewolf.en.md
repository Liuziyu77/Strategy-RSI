# Werewolf

[中文](werewolf.md) · [Game catalog](README.md)

Rules version: `social-deduction-v1`. Supports 6–12 players in Chinese or English. There are `floor(n / 3)` wolves, one seer, one witch, one hunter, and villagers in the remaining seats. Roles are reshuffled from the game seed each game; seat rotation does not fix a player's role.

| Players     | Wolves | Seer | Witch | Hunter | Villagers |
| ----------- | ------ | ---- | ----- | ------ | --------- |
| 6 / 7 / 8   | 2      | 1    | 1     | 1      | 1 / 2 / 3 |
| 9 / 10 / 11 | 3      | 1    | 1     | 1      | 3 / 4 / 5 |
| 12          | 4      | 1    | 1     | 1      | 5         |

## Round sequence

1. Each living wolf gets one private discussion turn. Wolves then vote to attack a non-wolf. A unique plurality selects the victim; a tie or all abstaining means no attack. Team messages and wolf ballots are visible only to wolves, including eliminated wolves.
2. The living seer may inspect one living player not previously inspected. The private result is wolf / not wolf.
3. The living witch may use one potion or pass. There is one antidote and one poison for the entire game, at most one potion per night. The attack victim is revealed to the witch only while the antidote remains. Self-healing is allowed only on night one. Poison may target any other living player.
4. Deaths from attack and poison resolve together at dawn. Pending victims still act that night. A hunter killed by attack, but not also poisoned, gets one shot or may pass before victory is checked.
5. Each survivor gets one public discussion turn in seat order, and may remain silent.
6. All survivors submit secret exile ballots or abstain; self-voting is prohibited. Ballots become public after everyone votes. A unique plurality is exiled. Tied candidates speak again, followed by one runoff among those candidates, with all survivors voting. A second tie or all abstaining means no exile.
7. An exiled hunter may shoot. Check victory after the shot, then begin the next night.

The village wins when all wolves are eliminated. Wolves win when living wolves equal or outnumber living non-wolves. Resolve hunter shots before checking a victory triggered by that death. If everyone dies, the all-wolves-eliminated condition takes precedence. Eliminated teammates share their faction’s victory.

## Communication, visibility and RSI

Daytime and hunter-window speech is public. Wolf night speech is team-private. Speech from other night roles is suppressed. Discussion turns always request a decision, even though `speak` is the only action, so models can choose their message or silence.

Players know their own role; wolves know teammates. Death does not reveal roles. Other players cannot identify the active seer or witch through the night observation. Ballots, inspections, potions and attack victims are filtered from both observations and history. Omniscient spectator and export APIs are experimenter interfaces and contain hidden data. Agents must use their seat-token `/api/agent/...` interface.

Both immediate and post-game RSI use the player’s own visible context, without automatically revealing the full role assignment at game end. Team chat enters only wolf contexts. Each Agent’s memories remain private and are reusable only within the same game type.

This version implements the fixed roles above, with no sheriff, guard, idiot, last words, interruptions or voice chat. Daytime discussion follows seat order, and the engine resolves night votes under fixed rules without a human moderator.
