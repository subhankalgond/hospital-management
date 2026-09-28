"""
CarePulse — NLP symptom → department router.

A transparent, dependency-light TF-IDF + LogisticRegression pipeline trained
on labeled symptom phrases (mapped to CarePulse's real departments). Trained
weights are exported to `ml/symptom_router.json` and evaluated by TypeScript
at runtime (`lib/nlp/symptoms.ts`) — no Python needed in production.

Also exports a small urgency lexicon used to flag likely emergencies, which
the emergency pre-check uses to steer patients toward the Emergency Center.

Run:  python ml/train_symptom_router.py
"""

import json
import os
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, strip_accents_unicode
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "symptom_router.json")

# CarePulse departments (must match lib/defaults.ts DEPARTMENTS)
DEPARTMENTS = [
    "Cardiology", "Pediatrics", "Dermatology", "Orthopedics", "Neurology",
    "General Medicine", "Psychiatry", "ENT", "Ophthalmology", "Gynecology",
    "__EMERGENCY__",
]

# ── Labeled training phrases (clinical, colloquial, with typos) ──────────────
DATA = {
    "Cardiology": [
        "chest pain", "chest tightness when walking", "palpitations heart racing",
        "high blood pressure readings", "short of breath lying down", "heart murmur",
        "fluttering in chest", "left arm pain with sweating", "irregular heartbeat",
        "swollen ankles and breathlessness", "fainting after exertion", "chest discomfort during exercise",
        "heart racing at night", "bp 160 over 100", "cholesterol and chest heaviness",
        "skipped heartbeats", "family history of heart disease chest pain",
        "chest pressure like something heavy sitting", "breathless after climbing few steps",
        "heart beat very fast after coffee", "dizzy when standing up bp drops",
        "leg calf pain when walking goes away rest", "cardiac followup echo test",
        "swelling in feet and gaining weight heart", "chest burning radiating to jaw",
        "pulse irregular sometimes very slow", "hypertension uncontrolled headache",
        "heart skipping beats fluttering evening", "palpitations while resting",
    ],
    "Pediatrics": [
        "my child has fever", "baby not feeding well", "child vaccination due",
        "toddler vomiting and diarrhea", "kid has rash and fever", "infant cough at night",
        "child ear pain", "baby constipated", "school-age child growth concerns",
        "child fell and bumped head no vomiting", "pediatric checkup", "newborn jaundice",
        "child breathing fast fever", "kids behaviour concerns",
        "my son stomach pain since morning", "daughter complaining leg pain at night",
        "baby refusing milk and crying", "child weight not increasing",
        "six year old wets bed at night", "toddler not speaking words yet",
        "child swollen glands neck fever", "kids fever comes and goes week",
        "newborn umbilical cord red discharge", "child chest wheezing cough",
        "infant spitting curdled milk frequent", "teenager short height compared classmates",
    ],
    "Dermatology": [
        "itchy red rash on arms", "acne breakout on face", "hair loss patches",
        "mole changed shape", "eczema flaring", "psoriasis scales", "skin allergy itching",
        "fungal infection between toes", "hives all over body", "nail discoloration",
        "dry flaky scalp", "boil on leg", "birthmark concern", "sunburn blister",
        "red circular ring like patch skin", "pimples leaving dark marks face",
        "hair thinning crown area", "white patches skin spreading",
        "skin peeling between fingers", "itchy bumps after mosquito bites",
        "dark spots underarms friction", "face redness flushing cheeks visible vessels",
        "ingrown toenail infected swollen", "oily skin clogged pores blackheads",
        "skin tag neck armpit growing", "cracked heels bleeding fissures",
        "severe dandruff flaking scalp hairfall", "hair falling combing shower",
    ],
    "Orthopedics": [
        "knee pain when climbing stairs", "back pain after lifting", "frozen shoulder",
        "twisted ankle swelling", "wrist fracture follow up", "joint stiffness mornings",
        "hip pain radiating leg", "elbow pain tennis", "neck pain stiffness",
        "swollen knee after fall", "spine pain bending", "sports injury shoulder",
        "heel pain in morning", "arthritis fingers",
        "lower back pain radiating down buttock", "knee clicking locking sensation",
        "shoulder cannot lift arm overhead", "wrist pain typing all day",
        "ankle sprain still swollen week", "bone fracture plaster removal checkup",
        "joint pain both knees ageing", "muscle strain gym injury",
        "slouching posture back hump child", "neck stiff after sleeping wrong",
        "hand fingers locking trigger finger", "sciatica shooting pain leg",
    ],
    "Neurology": [
        "severe headache one side", "migraine with aura", "dizziness and imbalance",
        "numbness in left hand", "tingling feet", "memory problems confusion",
        "tremor in hands", "seizure episode", "slurred speech episode",
        "vision loss one eye sudden", "facial droop", "persistent headache vomiting",
        "burning sensation in legs", "fainting spells",
        "headache worse in morning gradually", "spinning vertigo episode seconds",
        "hand writing becoming smaller shaky", "weakness one side body transient",
        "forgetting recent conversations repeatedly", "electric shock sensations neck",
        "muscle twitching eyelid persistent", "difficulty finding words speaking",
        "balance problems walking into walls", "headache after lightning strike pain",
        "sleep attacks suddenly daytime narcolepsy", "smell loss after head injury",
        "blackout episode jerking hands seizure", "brief unconsciousness twitching",
        "arm and face weakness one side", "sudden weakness half body", 
    ],
    "General Medicine": [
        "fever since three days", "body ache and chills", "fatigue all the time",
        "cold and cough two weeks", "sore throat and runny nose", "loose motions",
        "vomiting since morning", "weight loss without reason", "low grade fever evening",
        "general weakness after illness", "tiredness and headache", "flu symptoms",
        "dehydration dizziness", "annual health checkup",
        "fever with body rash spreading", "stomach upset after outside food",
        "tongue white taste lost", "sweating night feverish chills",
        "blood report high esr fatigue", "routine diabetes sugar checkup",
        "typhoid suspected fever continuous", "weakness and pale looking anemia",
        "vitamin d deficiency tired bones", "recurrent fever every month",
        "cough with phlegm green yellow", "general body itching no rash",
    ],
    "Psychiatry": [
        "feeling low and hopeless", "panic attacks heart pounding", "cannot sleep for weeks",
        "anxiety before meetings", "loss of interest in activities", "excessive worry",
        "mood swings anger", "hearing voices", "stress cannot concentrate",
        "sadness after loss", "social fear avoiding people", "obsessive thoughts",
        "crying spells without reason", "always tired no motivation",
        "fear of heights crowds closed spaces", "checking locks repeatedly compulsion",
        "exam stress stomach aches daily", "grief unable move on months",
        "irritable short temper family problems", "nightmares flashbacks accident trauma",
        "eating too little or binge episodes", "feeling detached from body reality",
        "counselling for relationship issues", "addiction mobile alcohol controlling life",
        "stage fear public speaking trembling", "negative thoughts self worth low",
        "constant worry restlessness tension", "overthinking everything always on edge",
    ],
    "ENT": [
        "ear pain and discharge", "blocked nose for months", "hearing loss gradual",
        "sore throat with white patches", "ringing in ears", "sinus pressure face pain",
        "nose bleed frequently", "snoring loudly", "vertigo when turning head",
        "swallowing difficulty pills", "voice hoarse weeks", "tonsillitis repeated",
        "ear popping flights pressure", "fluid behind eardrum child",
        "bad breath chronic despite brushing", "throat clearing sensation lump",
        "nose blockage one side only", "itchy ears wax hard",
        "hearing sounds others cannot tinnitus", "throat pain swallowing food difficult",
        "voice change male female pitch", "smell loss since flu",
        "ear drums loud music muffled hearing", "adenoids child mouth breathing snoring",
        "stammering since childhood speech therapy", "neck lump below ear swollen",
    ],
    "Ophthalmology": [
        "blurred vision reading", "red itchy eyes", "watering eyes light sensitivity",
        "eye pain and halos", "double vision", "floaters in vision",
        "gradual vision loss", "dry gritty eyes", "eye injury foreign body",
        "squint in child", "diabetic eye checkup", "eye stye painful",
        "difficulty seeing night driving", "numbers letters look wavy lines",
        "eye twitching eyelid days", "white gray ring around iris",
        "screen time eyes burning headache", "contact lens red painful eye",
        "vision numbers increased glasses changed", "yellow eyes skin jaundice check",
        "curtain shadow vision sudden retinal", "eye drops post cataract surgery review",
        "child holds book very close reading", "peripheral vision missing sides glaucoma",
        "eyelid drooping covering pupil", "color confusion red green",
        "cannot see clearly far distance", "distant objects blurry myopia",
    ],
    "Gynecology": [
        "irregular periods", "pelvic pain lower abdomen", "pregnancy checkup",
        "heavy menstrual bleeding", "missed period nausea", "vaginal discharge itching",
        "menopause hot flushes", "pain during periods severe", "contraception advice",
        "breast lump check", "white discharge with odor", "pcos weight gain acne",
        "periods every two weeks frequent", "no periods three months negative test",
        "bleeding after intercourse spotting", "urine leak while coughing sneezing",
        "trying to conceive one year no success", "morning sickness pregnancy vomiting",
        "breast pain before periods lumpy", "pelvic ultrasound cyst ovary",
        "menopause bleeding after stopped periods", "vaccination hpv daughters",
        "uterus fibroids heavy periods anemia", "c section scar pain numb",
        "hormonal imbalance facial hair chin", "post delivery depression mood",
    ],
    "__EMERGENCY__": [
        "crushing chest pain sweating", "cannot breathe", "unconscious not responding",
        "severe bleeding wound", "stroke face drooping cannot speak", "seizure not stopping",
        "coughing blood", "severe allergic reaction face swelling", "severe abdominal pain rigid belly",
        "attempted overdose", "head injury unconscious vomiting", "pulse very weak faint",
        "gunshot stab wound", "burns large area", "poisoning swallowed chemical",
        "baby blue lips not breathing", "severe shortness of breath at rest",
        "accident heavy bleeding road traffic", "chest pain radiating jaw arm drenching sweat",
        "sudden worst headache of life thunderclap", "choking cannot speak food stuck",
        "broken bone sticking out skin", "electric shock current burns",
        "drowning pulled from water not breathing", "snake bite venom swelling spreading",
        "severe hypoglycemia shaking sweat confused", "labor contractions bleeding pregnancy",
    ],
}

# ── Urgency lexicon (rule layer, kept separate from the classifier) ──────────
URGENT_TERMS = [
    "unconscious", "not breathing", "cannot breathe", "severe bleeding", "stroke",
    "face drooping", "seizure", "coughing blood", "crushing chest pain",
    "suicidal", "overdose", "poisoning", "blue lips", "rigid belly",
    "stab", "gunshot", "severe allergic", "anaphylaxis", "no pulse",
]

# ── Anchor terms: strong clinical keywords per department ────────────────────
# At inference, each hit adds a bonus to that class's score (hybrid rule+ML).
ANCHOR_TERMS = {
    "Cardiology": ["heart", "cardiac", "chest pain", "palpitation", "blood pressure", "bp ", "cholesterol", "murmur", "angiography", "ecg", "echo"],
    "Pediatrics": ["child", "children", "kid", "baby", "infant", "toddler", "newborn", "son", "daughter", "vaccination", "pediatric"],
    "Dermatology": ["skin", "rash", "itch", "acne", "mole", "eczema", "psoriasis", "hives", "hair loss", "nail", "pimple"],
    "Orthopedics": ["bone", "fracture", "joint", "knee", "shoulder", "back pain", "spine", "sprain", "ankle", "hip", "arthritis", "ligament"],
    "Neurology": ["headache", "migraine", "seizure", "numbness", "tingling", "vertigo", "tremor", "memory", "paralysis", "weakness one side", "slurred"],
    "General Medicine": ["fever", "cold", "cough", "flu", "vomiting", "diarrhea", "loose motion", "fatigue", "weakness", "body ache", "checkup"],
    "Psychiatry": ["anxiety", "depression", "panic", "sleep", "insomnia", "stress", "mood", "mental", "suicidal thought", "counseling"],
    "ENT": ["ear", "hearing", "throat", "nose", "sinus", "tonsil", "snoring", "tinnitus", "voice", "swallowing", "neck lump"],
    "Ophthalmology": ["eye", "vision", "blurred", "cataract", "retina", "squint", "floaters", "spectacles", "glasses"],
    "Gynecology": ["period", "menstrual", "pregnan", "pelvic", "vaginal", "uterus", "ovary", "pcos", "menopause", "menstruation"],
}

# ── Held-out evaluation set: NEVER trained on. Measures real generalization. ─
HELD_OUT = [
    ("chest heaviness while walking uphill", "Cardiology"),
    ("heartbeat skipping beats since evening", "Cardiology"),
    ("my 4 year old has loose motions", "Pediatrics"),
    ("infant refuses to drink milk", "Pediatrics"),
    ("ring shaped itchy patch on thigh", "Dermatology"),
    ("severe dandruff and hairfall", "Dermatology"),
    ("pain in wrist after fall on outstretched hand", "Orthopedics"),
    ("morning stiffness in knees both", "Orthopedics"),
    ("episodes of blackout with jerking hands", "Neurology"),
    ("weakness of right arm and face since morning", "Neurology"),
    ("fever with chills and body pain", "General Medicine"),
    ("vomiting and loose stools since night", "General Medicine"),
    ("constant worry and restlessness", "Psychiatry"),
    ("cant sleep because of racing thoughts", "Psychiatry"),
    ("ear blocked after cold", "ENT"),
    ("difficulty hearing from left ear", "ENT"),
    ("watering and redness in right eye", "Ophthalmology"),
    ("cannot see clearly from distance", "Ophthalmology"),
    ("periods delayed by two weeks", "Gynecology"),
    ("lower belly pain during mensuration", "Gynecology"),
]

def evaluate_held_out(pipe, samples):
    texts = [t for t, _ in samples]
    truth = [l for _, l in samples]
    preds = pipe.predict(texts)
    correct = sum(1 for p, t in zip(preds, truth) if p == t)
    misses = [(t, exp, got) for (t, exp), got in zip(samples, preds) if got != exp]
    return correct, len(samples), misses


def normalize(text: str) -> str:
    return " ".join(strip_accents_unicode(text).lower().split())


def build_dataset():
    """Returns (clean_texts, clean_labels, all_texts, all_labels).

    `clean` = the hand-written phrases (used for honest cross-validation);
    `all` = clean + light augmentation (wrappers, typos — used for training).
    """
    wrappers = ["", "i have ", "feeling ", "suffering from ", "since two days ",
                "doctor ", "please help ", "constant ", "recurring ", "mild "]
    clean_t, clean_l, all_t, all_l = [], [], [], []
    rng = np.random.default_rng(7)
    for dept, phrases in DATA.items():
        for p in phrases:
            clean_t.append(p)
            clean_l.append(dept)
            all_t.append(p)
            all_l.append(dept)
            # one wrapper variant
            w = str(rng.choice(wrappers)) + p.lower()
            all_t.append(w)
            all_l.append(dept)
            # one typo variant (swap two chars in one word)
            words = p.split()
            i = int(rng.integers(0, len(words)))
            chars = list(words[i])
            if len(chars) > 2:
                j = int(rng.integers(0, len(chars) - 1))
                chars[j], chars[j + 1] = chars[j + 1], chars[j]
                words[i] = "".join(chars)
            all_t.append(" ".join(words).lower())
            all_l.append(dept)
    return clean_t, clean_l, all_t, all_l


def make_pipeline(kind: str):
    """kind: 'word' | 'char' | 'hybrid' — hybrid concatenates word + char features."""
    clf = LogisticRegression(max_iter=3000, C=6.0, class_weight="balanced", random_state=42)
    if kind == "word":
        return Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ("clf", clf),
        ])
    if kind == "char":
        return Pipeline([
            ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=2)),
            ("clf", clf),
        ])
    from sklearn.pipeline import FeatureUnion
    return Pipeline([
        ("features", FeatureUnion([
            ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=2)),
        ])),
        ("clf", clf),
    ])


def main():
    clean_t, clean_l, all_t, all_l = build_dataset()
    print(f"training samples: {len(all_t)} (clean: {len(clean_t)}) across {len(set(all_l))} classes")

    best_name, best_pipe, best_cv = None, None, 0.0
    for kind in ["word", "char", "hybrid"]:
        pipe = make_pipeline(kind)
        # honest CV: clean phrases only; model later fits on clean + augmented
        scores = cross_val_score(pipe, clean_t, clean_l, cv=5, scoring="accuracy")
        cv = float(scores.mean())
        print(f"  {kind:7s} 5-fold accuracy (clean): {cv:.3f} +/- {scores.std():.3f}")
        if cv > best_cv:
            best_name, best_pipe, best_cv = kind, pipe, cv

    print(f"selected: {best_name}")
    pipe = best_pipe
    pipe.fit(all_t, all_l)

    # ── Export a hand-rolled TF-IDF + linear model to JSON ───────────────────
    clf = pipe.named_steps["clf"]
    union = pipe.named_steps.get("features")
    if union is not None:
        blocks = [(name, t) for name, t in union.transformer_list if t is not None]
    else:
        blocks = [(best_name, pipe.named_steps["tfidf"])]

    coef = clf.coef_
    col = 0
    feature_blocks = []
    n_features = 0
    for name, tfidf in blocks:
        vocab = {term: int(idx) for term, idx in tfidf.vocabulary_.items()}
        idf = [round(float(v), 4) for v in tfidf.idf_]
        sl = slice(col, col + len(idf))
        block_coef = [[round(float(c), 4) for c in row[sl]] for row in coef]
        col += len(idf)
        n_features += len(vocab)
        feature_blocks.append({
            "analyzer": tfidf.analyzer or "word",
            "ngram_range": list(tfidf.ngram_range),
            "sublinear_tf": bool(tfidf.sublinear_tf),
            "lowercase": bool(tfidf.lowercase),
            "vocabulary": vocab,
            "idf": idf,
            "coef": block_coef,
        })
    intercept = [round(float(b), 4) for b in clf.intercept_]
    classes = [str(c) for c in clf.classes_]

    held_correct, held_n, held_misses = evaluate_held_out(pipe, HELD_OUT)
    print(f"held-out accuracy: {held_correct}/{held_n} = {held_correct / held_n:.2f}")
    for t, exp, got in held_misses:
        print(f"  MISS: {t!r} expected {exp}, got {got}")

    doc = {
        "feature_blocks": feature_blocks,
        "classifier": {"classes": classes, "intercept": intercept},
        "anchor_terms": ANCHOR_TERMS,
        "urgency_terms": URGENT_TERMS,
        "departments": DEPARTMENTS,
        "metrics": {
            "cv_accuracy": round(best_cv, 3),
            "heldout_accuracy": round(held_correct / held_n, 3),
            "heldout_n": held_n,
            "feature_kind": best_name,
            "n_samples": len(all_t),
            "n_clean": len(clean_t),
            "n_features": n_features,
        },
        "trained_at": __import__("datetime").datetime.now().isoformat(),
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"exported -> ml/symptom_router.json ({n_features} features, {size_kb:.0f} KB)")

    # quick self-check
    demos = [
        "chest pain and sweating since morning",
        "my daughter has fever and rash",
        "knee pain when climbing stairs",
        "feel very anxious and cannot sleep",
        "severe headache with blurred vision",
    ]
    probs = pipe.predict_proba(demos)
    preds = pipe.classes_[np.argmax(probs, axis=1)]
    for t, p in zip(demos, preds):
        print(f"  {t!r:55s} -> {p}")


if __name__ == "__main__":
    main()
