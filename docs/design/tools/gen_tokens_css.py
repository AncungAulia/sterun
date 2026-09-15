"""Copy the design tokens into plain CSS custom properties for the mockups.

The mockups are standalone HTML opened straight from the repository, so they
cannot run Tailwind's @theme. This rewrites the same values into :root, from the
one source in landing-page/app/tokens.css, so a mockup never carries its own hex.

Every docs/design/<name>/mockups/ folder gets the same generated file, so a
second design folder costs nothing and cannot drift from the first.

    python docs/design/tools/gen_tokens_css.py
"""

import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
DESIGN = HERE.parent
ROOT = HERE.parents[2]
SRC = ROOT / "landing-page" / "app" / "tokens.css"

text = SRC.read_text(encoding="utf-8")
block = re.search(r"@theme\s*\{(.*?)\n\}", text, re.S)
assert block, f"no @theme block in {SRC}"
names = re.findall(r"^\s*(--[a-z0-9-]+):\s*([^;]+);", block.group(1), re.M)
assert len(names) > 40, f"only {len(names)} tokens found in {SRC}"

lines = [
    "/* GENERATED from landing-page/app/tokens.css by docs/design/tools/gen_tokens_css.py.",
    "   Do not edit by hand: change the token file and regenerate. The mockups are",
    "   plain HTML, so Tailwind's @theme cannot run here; these are the same values",
    "   as :root custom properties. */",
    ":root {",
]
lines += [f"  {name}: {value.strip()};" for name, value in names]

# next/font defines --font-poppins / --font-big-shoulders inside the apps. Plain
# HTML has neither, and an undefined var() makes the whole font-family
# declaration invalid, so the mockups first rendered in Times. Name the real
# families here; the boards load them, and the stacks in the tokens stay as the
# fallback for anyone opening this offline.
lines += [
    "",
    "  /* The families next/font injects in the apps, named here for plain HTML. */",
    '  --font-poppins: "Poppins";',
    '  --font-big-shoulders: "Big Shoulders Display";',
    "}",
]

out_dirs = sorted(p for p in DESIGN.glob("*/mockups") if p.is_dir())
assert out_dirs, f"no <design>/mockups folders under {DESIGN}"
for out_dir in out_dirs:
    (out_dir / "tokens.css").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {(out_dir / 'tokens.css').relative_to(ROOT)} ({len(names)} tokens)")
