# Training

**Owner: Sathwik.**

## The labelling trick

You don't need human annotation. Labels come free from the history itself:

> For a reading at time `t`, label it **1** if the price drops at least `X%`
> below that reading within the next `N` days, else **0**.

Then "should I wait?" becomes a supervised binary classification problem, and
every exported price history is training data. Start with `X = 5`, `N = 30`.

Features come from `ocular_ai.features.extract_features` — **use that function,
don't reimplement it**. Training/serving feature skew is the classic way to build
a model that scores well offline and behaves badly in production.

## Watch out for

- **Leakage.** When computing features for a point at time `t`, only use readings
  up to `t`. It is very easy to accidentally include the future when the whole
  series is in memory.
- **Split by product, not by row.** Readings from one product are highly
  correlated; a random row split leaks the answer across the split and inflates
  your score.
- **Class imbalance.** Most readings are not followed by a big drop. Report
  precision/recall, not accuracy — a model that always says "wait" will look
  ~85% accurate and be worthless.
- **Compaction.** The extension collapses runs of identical prices into one point
  with a moving `lastSeen`. Re-expand to a daily series before computing
  time-based features, or "days since minimum" will be wrong.

## Ship criteria

A model replaces the baseline only when it beats it on the held-out set — see
`eval/metrics.py`. Include the fake-sale cases from `tests/test_baseline.py` in
the eval set; they are the ones that matter most to a real shopper.

## Getting data

Export from the extension (Options → Backup → Export now). That JSON is the input
format for `build_dataset.py`.

**Never commit real user data.** `data/` is gitignored. Until there is an
explicit opt-in flow with a privacy policy behind it, train on your own exports
and synthetic series.
