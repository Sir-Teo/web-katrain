# SGF encoding fixtures

These are small, synthetic 9×9 studies authored for this repository. Each has
one black move at `dd`, two player names, and a study comment. Their on-disk
bytes deliberately use the encoding in the root `CA` property:

| File | Encoding | Black | White | Comment |
| --- | --- | --- | --- | --- |
| `shift-jis.sgf` | Shift_JIS | 本因坊 | 呉清源 | 手筋の研究 |
| `euc-kr.sgf` | EUC-KR | 이세돌 | 조훈현 | 바둑 공부 |
| `gbk.sgf` | GBK | 古力 | 柯洁 | 围棋研究 |
| `latin1.sgf` | ISO-8859-1 | André | François | Étude annotée |

Do not save these files as UTF-8 in an editor. Tests verify decoded metadata,
comments, moves, and re-import after the library exports UTF-8.
