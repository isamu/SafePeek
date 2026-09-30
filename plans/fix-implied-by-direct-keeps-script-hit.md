# fix: a platform implied by a directly seen technology is kept even if it was also seen in script code

## Problem
Regression from #6. On techcrunch.com, WordPress is seen directly (generator meta) and implies PHP. PHP had already
been hit from script content alone, so `applyImplies` found an existing hit and did nothing, and the directness
upgrade only applied to hits that were themselves implied. PHP was then dropped as a script-only platform.

## Change
`engine/technologies.js` `applyImplies`: any existing hit that a directly seen technology implies becomes direct
(and records "implied by X" as evidence), and the upgrade is passed down the chain.

## Verification
Unit test red on main, green here. techcrunch.com lists PHP again ("script content", "implied by WordPress").
