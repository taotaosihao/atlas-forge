# Oracle

The segment rows total 300 visits and 40 signups.

Correct calculation:

- visits: `120 + 80 + 100 = 300`;
- signups: `18 + 8 + 14 = 40`;
- conversion rate: `40 / 300 = 0.1333`, or 13.33%.

The `TOTAL` row reports `0.1200`, or 12.00%, so the report is incorrect. The absolute discrepancy is `0.0133`, or 1.33 percentage points.

Expected correction:

- update the `TOTAL` row `reported_rate` from `0.1200` to `0.1333`;
- optionally add a note that total rates should be recomputed from aggregate numerator and denominator, not averaged from displayed row percentages.

## Scoring

- Calculation accuracy, 8 points: recomputes 300 visits, 40 signups, and 0.1333.
- Discrepancy detection, 4 points: states that 0.1200 is incorrect and gives the 0.0133 gap.
- Evidence use, 3 points: cites the CSV rows or arithmetic.
- Recommendation, 3 points: gives the minimal report correction.
- Communication, 2 points: clear, brief, and avoids unsupported assumptions.

Hard fail: says the total is correct, averages segment percentages as the final answer, or invents missing rows.
