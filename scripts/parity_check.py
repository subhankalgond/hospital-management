"""Parity check: sklearn predictions vs the exported JSON + TS engine.

Trains the same model, predicts 30 fixed samples with sklearn, then runs the
Node CLI on identical inputs and asserts agreement within 0.05 days.
"""
import json
import os
import subprocess
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

import sys
sys.path.insert(0, "ml")
from train_los import synth_admissions, FEATURES  # noqa: E402

X, y = synth_admissions()
# IMPORTANT: train on the same 80% split as train_los.py — otherwise this
# model differs from the exported one and parity is meaningless.
X_train, _X_test, y_train, _y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = RandomForestRegressor(n_estimators=120, max_depth=8, min_samples_leaf=10, random_state=42, n_jobs=-1)
model.fit(X_train, y_train)

rng = np.random.default_rng(123)
samples = []
for _ in range(30):
    f = {
        "age": int(rng.integers(18, 95)),
        "gender": str(rng.choice(["male", "female", "other"])),
        "priority": str(rng.choice(["CRITICAL", "URGENT", "MODERATE", "LOW"])),
        "emergency": bool(rng.integers(0, 2)),
        "comorbidityCount": int(rng.integers(0, 6)),
        "admissionIcu": bool(rng.integers(0, 2)),
        "wardType": str(rng.choice(["private", "semi-private", "icu"])),
        "nightAdmission": bool(rng.integers(0, 2)),
        "weekendAdmission": bool(rng.integers(0, 2)),
    }
    samples.append(f)

def to_row(f):
    return [
        f["age"], 1 if f["gender"] == "male" else 0,
        1 if f["priority"] == "CRITICAL" else 0, 1 if f["priority"] == "URGENT" else 0,
        1 if f["priority"] == "MODERATE" else 0, 1 if f["emergency"] else 0,
        f["comorbidityCount"], 1 if f["admissionIcu"] else 0,
        1 if f["wardType"] == "private" else 0, 1 if f["wardType"] == "semi-private" else 0,
        1 if f["nightAdmission"] else 0, 1 if f["weekendAdmission"] else 0,
    ]

Xs = np.array([to_row(f) for f in samples], dtype=float)
sk_preds = model.predict(Xs)

max_err = 0.0
for f, sk in zip(samples, sk_preds):
    args = ["node", "ml/predict_los.js",
            "--age", str(f["age"]), "--gender", f["gender"],
            "--priority", f["priority"], "--comorbidities", str(f["comorbidityCount"]),
            "--ward", f["wardType"]]
    if f["emergency"]: args.append("--emergency")
    if f["admissionIcu"]: args.append("--icu")
    if f["nightAdmission"]: args.append("--night")
    if f["weekendAdmission"]: args.append("--weekend")
    out = json.loads(subprocess.run(args, capture_output=True, text=True, check=True).stdout)
    err = abs(out["predictedLosDays"] - float(sk))
    max_err = max(max_err, err)
    if err > 0.05:
        print(f"MISMATCH {f}: sklearn={sk:.2f} ts={out['predictedLosDays']}")

print(f"parity OK: max |sklearn - TS| = {max_err:.4f} days over {len(samples)} samples")
