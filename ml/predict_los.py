#!/usr/bin/env python
"""
CarePulse — LOS prediction CLI (Python).

Loads the exported model metadata and re-derives predictions via sklearn's
tree structures is unnecessary — the JSON export is the single source of
truth, so this CLI simply shells the Node evaluator that walks the same
exported forest (identical results, one implementation):

    python ml/predict_los.py --age 65 --priority CRITICAL --icu --comorbidities 3

For a pure-Python inference path, see train_los.py which can re-train and
predict directly with sklearn.
"""
import json
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    node = subprocess.run(
        ["node", os.path.join(HERE, "predict_los.js"), *sys.argv[1:]],
        capture_output=True, text=True, check=True,
    )
    out = json.loads(node.stdout)
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
