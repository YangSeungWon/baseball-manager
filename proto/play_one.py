import random, sys, roster
from game_engine import play_game

teams = roster.make_league(8, seed=int(sys.argv[1]) if len(sys.argv) > 1 else 1)
rng = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 42)
H, A = play_game(teams[0], teams[1], rng, verbose=True)

print("\n" + "=" * 62)
print(f"{'':14}" + "".join(f"{x:>3}" for x in range(1, len(A.line) + 1)) + f"{'R':>5}{'H':>3}")
print(f"{A.team.name:<14}" + "".join(f"{x:>3}" for x in A.line) + f"{A.runs:>5}{A.hits:>3}")
print(f"{H.team.name:<14}" + "".join(f"{x:>3}" for x in H.line) + f"{H.runs:>5}{H.hits:>3}")
print("=" * 62)
for S in (A, H):
    print(f"\n[{S.team.name} 투수]")
    for pl in S.pitchers:
        dec = " (승)" if pl.w else " (패)" if pl.l else " (세)" if pl.sv else ""
        print(f"  {pl.p.name:<5} {pl.ip:>4}이닝  피안타{pl.h:>2} 실점{pl.r:>2} 삼진{pl.k:>2} "
              f"볼넷{pl.bb:>2} 피로{pl.fatigue:.2f}{dec}")
    print(f"[{S.team.name} 타자]")
    for b in S.team.lineup:
        L = S.bat[id(b)]
        if L.pa:
            print(f"  {b.name:<5}{b.position:>3}  {L.ab}타수 {L.h}안타 "
                  f"{L.hr}홈런 {L.rbi}타점 {L.bb}볼넷 {L.k}삼진")
