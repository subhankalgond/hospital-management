"""
CarePulse — Length-of-Stay (LOS) forecasting model.

Trains on synthetic hospital admission logs whose feature relationships follow
patterns observed in MIMIC-III style admission data (age, priority,
comorbidity burden, admission type, ward type). Two candidate models are
trained and compared:

  - RandomForestRegressor        (coordinator suggestion)
  - HistGradientBoostingRegressor (sklearn's XGBoost-style learner)

The best model by MAE is exported to `ml/los_model.json` — a pure JSON
representation of the tree ensemble that the TypeScript app evaluates at
runtime (no Python needed in production). A CLI (`predict_los.py`) loads the
same model for standalone predictions.

Run:  python ml/train_los.py
"""

import json
import os
import numpy as np
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "los_model.json")

# ── Feature schema (must match lib/ml/los.ts) ────────────────────────────────
FEATURES = [
    "age",                      # years
    "gender_male",              # 1/0
    "priority_critical",        # 1/0
    "priority_urgent",          # 1/0
    "priority_moderate",        # 1/0
    "emergency",                # 1/0 — emergency vs planned admission
    "comorbidity_count",        # chronic conditions
    "admission_icu",            # 1/0
    "ward_type_private",        # 1/0
    "ward_type_semi_private",   # 1/0
    "night_admission",          # 1/0
    "weekend_admission",        # 1/0
]
TARGET = "los_days"

RNG = np.random.default_rng(42)
N = 6000


def synth_admissions(n: int = N):
    """Generate admission logs with clinically-plausible LOS relationships."""
    age = RNG.integers(18, 95, n).astype(float)
    gender_male = (RNG.random(n) < 0.48).astype(float)
    roll = RNG.random(n)
    priority = np.select(
        [roll < 0.12, roll < 0.40, roll < 0.80], ["critical", "urgent", "moderate"], default="low"
    )
    priority_critical = (priority == "critical").astype(float)
    priority_urgent = (priority == "urgent").astype(float)
    priority_moderate = (priority == "moderate").astype(float)
    emergency = ((priority == "critical") | (priority == "urgent") | (RNG.random(n) < 0.15)).astype(float)
    comorbidity_count = np.minimum(
        RNG.poisson(0.4 + age / 90.0, n), 6
    ).astype(float)  # older patients carry more chronic conditions
    admission_icu = ((priority == "critical") & (RNG.random(n) < 0.8) | (RNG.random(n) < 0.06)).astype(float)
    ward_roll = RNG.random(n)
    ward_private = (ward_roll < 0.3).astype(float)
    ward_semi = ((ward_roll >= 0.3) & (ward_roll < 0.75)).astype(float)
    hour = RNG.integers(0, 24, n)
    night_admission = ((hour >= 20) | (hour < 6)).astype(float)
    weekday = RNG.integers(0, 7, n)
    weekend_admission = (weekday >= 5).astype(float)

    # LOS generator — the relationships the models must recover:
    base = 1.5 + 0.02 * np.maximum(age - 40, 0) / 5.0
    los = (
        base
        + 3.2 * priority_critical
        + 1.4 * priority_urgent
        + 0.5 * priority_moderate
        + 0.9 * comorbidity_count
        + 4.5 * admission_icu
        + 0.4 * emergency
        - 0.3 * ward_private
        + RNG.gamma(2.0, 1.1, n)          # skewed residual (long tails for ICU)
    )
    los = np.clip(los, 0.5, 45)

    X = np.column_stack([
        age, gender_male, priority_critical, priority_urgent, priority_moderate,
        emergency, comorbidity_count, admission_icu, ward_private, ward_semi,
        night_admission, weekend_admission,
    ]).astype(float)
    return X, los


def export_forest(model, features, out_path: str):
    """Export a sklearn tree ensemble to plain JSON consumable by TypeScript."""
    if hasattr(model, "estimators_"):
        trees = [e.tree_ for e in model.estimators_]
        kind = "randomforest"
        scale = 1.0 / len(trees)  # RandomForest AVERAGES tree outputs
    else:
        # HistGradientBoosting: sum of trees * learning_rate
        trees = [t for t in model._predictors[0] if t is not None]
        # predictors is per-output; flatten
        preds = []
        for stage in model._predictors:
            preds.extend([p for p in stage if p is not None])
        trees = [p._raw_predictor if hasattr(p, "_raw_predictor") else p for p in preds]
        kind = "gbdt"
        scale = float(model.learning_rate)

    exported = []
    for t in trees:
        # sklearn tree arrays
        exported.append({
            "feature": t.feature.tolist(),
            "threshold": [round(float(x), 4) for x in t.threshold.tolist()],
            "children_left": t.children_left.tolist(),
            "children_right": t.children_right.tolist(),
            "value": [round(float(v[0]), 4) for v in t.value.reshape(t.value.shape[0], -1).tolist()],
        })
    doc = {
        "model": kind,
        "features": features,
        "n_trees": len(exported),
        "scale": scale,
        "base_prediction": float(getattr(model, "constant_predict", [0.0])[0]) if kind == "gbdt" and hasattr(model, "constant_predict") else 0.0,
        "trained_at": __import__("datetime").datetime.now().isoformat(),
        "metrics": model._carepulse_metrics,
        "trees": exported,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f)
    return doc


def main():
    X, y = synth_admissions()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    candidates = {
        "random_forest": RandomForestRegressor(
            n_estimators=120, max_depth=8, min_samples_leaf=10, random_state=42, n_jobs=-1
        ),
        "hist_gradient_boosting": HistGradientBoostingRegressor(
            max_iter=200, max_depth=6, learning_rate=0.08, min_samples_leaf=20, random_state=42
        ),
    }

    results = {}
    best_name, best_mae = None, None
    for name, model in candidates.items():
        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        mae = float(mean_absolute_error(y_test, pred))
        r2 = float(r2_score(y_test, pred))
        results[name] = {"mae": round(mae, 3), "r2": round(r2, 3)}
        model._carepulse_metrics = results[name]
        print(f"{name:24s} MAE={mae:.3f} days  R²={r2:.3f}")
        if best_mae is None or mae < best_mae:
            best_name, best_mae = name, mae

    print(f"\nSelected model: {best_name}")
    model = candidates[best_name]
    doc = export_forest(model, FEATURES, OUT_PATH)
    doc["selected"] = best_name
    doc["candidates"] = results
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f)

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Exported -> ml/los_model.json ({doc['n_trees']} trees, {size_kb:.0f} KB)")

    # quick self-check: sample predictions via the model itself
    sample = X_test[:5]
    print("sample preds:", [round(float(p), 1) for p in model.predict(sample)])
    print("sample truth:", [round(float(t), 1) for t in y_test[:5]])


if __name__ == "__main__":
    main()
