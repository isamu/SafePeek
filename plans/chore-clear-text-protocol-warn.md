# chore: sonarjs/no-clear-text-protocols as a warning

SafePeek inspects sites served over plain HTTP, so `http://` URLs appear as test data (fixtures, transport
checks). `sonarjs/no-clear-text-protocols` failed the lint on them and pushed tests into building URLs from parts.
It is now a warning: still shown, no longer blocking. `noInlineConfig` stays on.
