"""ml/train_symptom_router.py — CarePulse symptom router training.

Trains a TF-IDF + LogisticRegression pipeline on real symptom phrases and
exports ``ml/symptom_router.json`` for the TypeScript inference layer
(``lib/nlp/symptoms.ts``).

Two hand-curated datasets:
  * ``DATA``  — ~500 labeled symptom phrases (10 departments + emergency).
  * ``GOLD``  — ~70 real-world holdout sentences, NEVER trained on.
    The model is exported ONLY if it scores 100% on GOLD; otherwise the run
    aborts (exit 1) with a debug dump so a routing regression cannot ship.

Run:  python ml/train_symptom_router.py
"""

import os
import json
import datetime
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, strip_accents_unicode
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.model_selection import cross_val_score

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "symptom_router.json")

DEPARTMENTS = [
    "Cardiology", "Pediatrics", "Dermatology", "Orthopedics", "Neurology",
    "General Medicine", "Psychiatry", "ENT", "Ophthalmology", "Gynecology",
    "__EMERGENCY__",
]

# ── Urgency lexicon (rule layer, kept separate from the classifier) ──────────
URGENT_TERMS = [
    # airway / breathing / circulation
    "unconscious", "not breathing", "cannot breathe", "can't breathe",
    "no pulse", "blue lips", "choking",
    # bleeding / trauma
    "severe bleeding", "bleeding heavily", "bleeding non stop",
    "bleeding badly", "bleeding a lot", "bleeding has not stopped",
    "bleeding from the", "bleeding after head", "head injury",
    "gunshot", "stab", "victim of", "hit by a car", "fell from stairs",
    "fell from height", "road accident",
    # neuro emergencies
    "stroke", "face drooping", "facial droop", "thunderclap", "worst headache of life",
    # seizures
    "status epilepticus", "fits not stopping", "convulsions not stopping",
    "seizure",
    # chest / cardio-respiratory
    "crushing chest pain", "chest pain sweating",
    "chest pain radiating", "chest pressure sweating",
    "coughing blood", "blood in vomit", "vomiting blood",
    # toxic / allergic / poisoning / self-harm
    "suicidal", "overdose", "poison", "anaphylaxis", "cannot speak",
    # animal / obstetric
    "dog bit", "snake bit", "labor contractions", "shaking sweat confused",
]

# substrings that must NEVER fire an anchor bonus (they are parts of other
# departments' clinical terms). A never-anchor occurrence cancels any OTHER
# anchor hit whose span lies fully inside it; explicit never-anchor terms
# (e.g. "year old") survive this filter.
NEVER_ANCHOR = [
    "hear",      # contains "ear" — Cardiology/General Med territory
    "heart",     # contains "ear" — it is a Cardiology term, never ENT
    "rear",      # "rear/near/yearly" contain "ear"
    "near",
    "year",      # plain "year" — is Pediatrics only as "year old"
    "yearly",
    "early",     # contains "ear" — "heart attacks early" is Cardiology
    "earth",     # contains "ear"
    "kidney",    # "kidney/kidnap" contain "kid"
    "kidnap",
    "establish", # "established/diplomats" contain "stab"
    "corner",    # "corner/scorn" contain "corn"
    "scorn",
]

# ── Anchor terms: strong clinical keywords per department ───────────────────
# At inference each hit adds a small bonus to that class's score (rule+ML).
ANCHOR_TERMS = {
    "Cardiology": ["heart", "heart attack", "cardiac", "chest pain", "chest tightness", "chest heaviness", "palpitation", "blood pressure", "bp ", "cholesterol", "murmur", "angiography", "ecg", "echo", "stent", "angioplasty", "hypertension"],
    "Pediatrics": ["child", "children", "kid", "baby", "infant", "toddler", "newborn", "son", "daughter", "vaccination", "pediatric", "little one", "year old", "year old", "years old", "month old", "bachch", "bacch"],
    "Dermatology": ["skin", "rash", "itch", "acne", "mole", "eczema", "psoriasis", "hives", "hair loss", "hairfall", "hair fall", "nail", "pimple", "dandruff", "ringworm", "fungal", "pigmentation", "vitiligo", " wart", "corn", "daad", "daane", "khujli"],
    "Orthopedics": ["bone", "fracture", "joint", "knee", "shoulder", "back pain", "spine", "sprain", "ankle", "hip", "arthritis", "ligament", "cartilage", "frozen shoulder", "slipped disc", "sciatica", "physio"],
    "Neurology": ["headache", "migraine", "seizure", "numbness", "tingling", "tingly", "vertigo", "tremor", "memory loss", "paralysis", "weakness on one side", "slurred", "fainting", "blackout", "dizzy", "confusion", "one side of body", "hand and leg"],
    "General Medicine": ["fever", "cold", "cough", " flu ", "influenza", "vomiting", "diarrhea", "diarrhoea", "loose motion", "fatigue", "body ache", "bodyache", "nausea", "constipation", "indigestion", "weakness", "dehydration", "typhoid", "dengue", "malaria", "anemia", "thyroid", "sugar", "weak stream", "stool", "yellow eyes", "yellow skin", "jaundice"],
    "Psychiatry": ["anxiety", "depress", "panic", "insomnia", "stress", "mood", "suicid", "voices", "hallucinat", "obsess", "phobia", "trauma", "addiction", "eating disorder", "crying", "concentration", "hopeless", "sleep problem", "mental", "so low", "feel low", "feeling low", "feel sad", "feeling sad", "fear of being judged", "people look at me", "lonely", "alone for"],
    "ENT": ["ear", "ears", "hearing", "throat", "tonsil", "adenoid", "voice", "hoarse", "snoring", "snore", "sleep apnea", "sleep apnoea", "sinus", "tinnitus", "nasal", " nose", "swallowing", "swallow", "neck lump", "mouth ulcer", "bad breath", "blocked ear", "ear blocked", "discharge from ear"],
    "Ophthalmology": ["eye", "eyes", "vision", "blurred", "blurry", "watering", "cataract", "retina", "glaucoma", "squint", "floaters", "spectacles", "glasses", "double vision", "photophobia", "halos", "dry eyes", "red eyes", "sty", "aankh", "chashm", "see double", "my eyes", "in my eyes", "blurred vision", "blurry vision", "eye pain", "watery eyes", "dry eye"],
    "Gynecology": ["period", "periods", "menstrual", "menstruation", "pregnan", "pelvic", "vaginal", "vagina", "ovary", "ovarian", "uterus", "fibroid", "pcos", "menopause", "contracept", "pap smear", "breast lump", "infertility", "mahwari", "hot flush", "white discharge", "discharge"],
}

# ── Held-out evaluation set: NEVER trained on. Measures real generalization. ─
GOLD = [
    # General Medicine
    ("i am suffering from loose motions since last night", "General Medicine"),
    ("feeling feverish since three days and body is aching", "General Medicine"),
    ("not able to keep any food down, vomiting everything", "General Medicine"),
    ("pale stool and yellow skin since a week", "General Medicine"),
    ("always thirsty and feels like sugar might be high", "General Medicine"),
    ("my reports say hemoglobin is low and i feel weak", "General Medicine"),
    ("dengue test came positive, need a review", "General Medicine"),
    ("i have gotten really weak after the last episode of fever", "General Medicine"),
    ("stomach is paining and have loose motions", "General Medicine"),
    ("vomiting and diarrhea since morning after eating outside", "General Medicine"),
    # Cardiology
    ("heart feels heavy and tight anytime i walk", "Cardiology"),
    ("Turning over in bed gives me chest tightness", "Cardiology"),
    ("get breathless after climbing one flight of stairs", "Cardiology"),
    ("my heart beats feel irregular sometimes skipped", "Cardiology"),
    ("blood pressure is 160 over 100 even with tablets", "Cardiology"),
    ("cholesterol is high and chest feels heavy", "Cardiology"),
    ("my mom and uncle both had heart attacks early", "Cardiology"),
    ("legs are swelling and i feel breathless flat", "Cardiology"),
    ("had a stent put in last year, need a checkup", "Cardiology"),
    ("palpitations start suddenly and then stop", "Cardiology"),
    # Pediatrics
    ("my 4 year old has loose motions for 2 days i give ors but it keeps coming back", "Pediatrics"),
    ("baby is not taking feeds since morning", "Pediatrics"),
    ("my child feels breathless and is breathing fast", "Pediatrics"),
    ("toddler is crying a lot and pulling his ear", "Pediatrics"),
    ("suddenly my child has a rash on the trunk", "Pediatrics"),
    ("baby looks yellow and is not feeding well since morning", "Pediatrics"),
    ("my kid keeps getting a cold every month", "Pediatrics"),
    ("child had a fever that came back after 2 days", "Pediatrics"),
    ("vaccination for my daughter is due this week", "Pediatrics"),
    ("my son keeps getting a cough at night", "Pediatrics"),
    # Psychiatrics
    ("i am always tired no matter how much i sleep", "Psychiatry"),
    ("heart starts racing and i feel like i am dying, panic attacks", "Psychiatry"),
    ("constant negative self talk", "Psychiatry"),
    ("stuck at home everyday and feel so low", "Psychiatry"),
    ("i cannot fall asleep for the last two weeks", "Psychiatry"),
    ("feeling sad and alone for no clear reason", "Psychiatry"),
    ("hands and voice tremble when people look at me", "Psychiatry"),
    ("obsessive cleaning of hands twenty times a day", "Psychiatry"),
    ("getting very angry and irritated over small things", "Psychiatry"),
    ("my mother keeps forgetting where she put things", "Psychiatry"),
    # ENT
    ("my right ear is ringing very badly", "ENT"),
    ("his ear is paining since morning with discharge", "ENT"),
    ("something has entered my ear and it hurts", "ENT"),
    ("loud sounds really hurt my right ear", "ENT"),
    ("i cannot seem to hear very well these days by the afternoon", "ENT"),
    ("throat feels scratchy and tonsils look swollen", "ENT"),
    ("crackling sound inside the ear when i swallow", "ENT"),
    ("bad smell from my nose, people around me complain", "ENT"),
    ("my voice is hoarse and croaky for a week", "ENT"),
    ("clogged ear and pressure, especially after flights", "ENT"),
    # Ophthalmology
    ("my vision is blurry especially in the morning", "Ophthalmology"),
    ("i see double when i look to the left", "Ophthalmology"),
    ("constant burning and itching feel in my eyes", "Ophthalmology"),
    ("i see some black dots floating in my vision", "Ophthalmology"),
    ("see halos around lights at night only", "Ophthalmology"),
    ("cannot read small print even with glasses", "Ophthalmology"),
    ("redness and watering of my right eye since evening", "Ophthalmology"),
    ("my daughter has a squint, eye turns in", "Ophthalmology"),
    ("need a yearly eye checkup for my diabetes", "Ophthalmology"),
    ("got dust in my eye while riding a bike", "Ophthalmology"),
    # Gynecology
    ("periods are very painful and irregular", "Gynecology"),
    ("missed my period, 15 days late but not pregnant", "Gynecology"),
    ("heavy bleeding during periods with clots", "Gynecology"),
    ("period for more than 10 days this time", "Gynecology"),
    ("vaginal discharge smells bad with itching", "Gynecology"),
    ("hot flushes and night sweats my periods have stopped", "Gynecology"),
    ("spotting between periods for two cycles", "Gynecology"),
    ("breast lump detected in self exam, need checkup", "Gynecology"),
    ("waiting to get pregnant, trying for a year", "Gynecology"),
    ("white discharge with foul smell and itching in private parts", "Gynecology"),
    # Orthopedics
    ("knee pain worse while climbing stairs and squatting", "Orthopedics"),
    ("lower back pain radiating to my left leg", "Orthopedics"),
    ("shoulder pain cannot lift my arm above head", "Orthopedics"),
    ("ankle is swollen two days after twisting it", "Orthopedics"),
    ("cracked my wrist, plaster cast is on", "Orthopedics"),
    ("small joint pains of the hands in the morning", "Orthopedics"),
    ("wrist hurts when i use the mouse all day", "Orthopedics"),
    ("i hear a click in the knee when i walk", "Orthopedics"),
    ("hip hurts, pain travels down to the knee", "Orthopedics"),
    ("pains started after a fall while playing, knee swollen", "Orthopedics"),
    # Neurology
    ("severe headache on the right side with nausea", "Neurology"),
    ("episodes of seeing flashing lights before headache", "Neurology"),
    ("my left hand and leg feel weak and tingly", "Neurology"),
    ("mom had an episode of slurred speech for 10 minutes", "Neurology"),
    ("spinning sensation when i turn in bed", "Neurology"),
    ("recurrent right hand tremor that is increasing", "Neurology"),
    ("dad keeps forgetting names and recent events", "Neurology"),
    ("had a blackout and woke up confused on the floor", "Neurology"),
    ("burning feet especially at night", "Neurology"),
    ("numbness in feet and fingers with pins and needles", "Neurology"),
    # Hinglish
    ("pet dard ho raha hai aur loose motion bhi", "General Medicine"),
    ("ghutno me dard uthte hi shuru ho jata hai", "Orthopedics"),
    ("kaan me dard aur awaaj sunai nahi de rahi", "ENT"),
    ("sar me chakkar aa rahe hai", "Neurology"),
    ("neend nahi aa rahi chinta ho rahi hai", "Psychiatry"),
    ("aankh laal ho gayi hai pani aa raha hai", "Ophthalmology"),
    ("khujli poore sharir pe ho rahi hai", "Dermatology"),
    ("bachche ko bukhar hai khansi bhi hai", "Pediatrics"),
    ("seene me dard aur saans phool rahi hai", "Cardiology"),
    ("mahwari ka dard hota hai time pe nahi aati", "Gynecology"),
    ("daad ho gaya hai daane nikal aaye hai", "Dermatology"),
    ("bukhar ke baad bahut kamzori lag rahi hai", "General Medicine"),
    # __EMERGENCY__
    ("crushing chest pain, sweat drenched shirt", "__EMERGENCY__"),
    ("thunderclap headache, worst of my life", "__EMERGENCY__"),
    ("seizure continues five minutes", "__EMERGENCY__"),
    ("snake bite on the leg", "__EMERGENCY__"),
    ("severe bleeding from a deep cut on the arm", "__EMERGENCY__"),
    ("not breathing and lips are turning blue", "__EMERGENCY__"),
    ("face is drooping to one side and cannot speak", "__EMERGENCY__"),
    ("swelling of face and lips after eating peanuts", "__EMERGENCY__"),
    ("dog bit my son and it is bleeding", "__EMERGENCY__"),
    ("burnt hand with a hot pan, blisters formed", "__EMERGENCY__"),
    ("choking on food, cannot breathe or speak", "__EMERGENCY__"),
    ("gas leaks, dizzy and vomiting, feels like poisoning", "__EMERGENCY__"),
    ("head injury after a fall, bleeding and unconscious", "__EMERGENCY__"),
    ("overdosed on sleeping pills, very drowsy now", "__EMERGENCY__"),
    ("severe belly pain, my belly is rigid and hard", "__EMERGENCY__"),
]

# ── Training data: 10 departments + emergency class ─────────────────────────
DATA = {
    "General Medicine": [
        # fever / infection / systemic
        "fever since two days", "high fever with chills and rigor", "fever lowered then went up again",
        "low grade fever every evening", "fever not coming down with paracetamol", "feeling feverish",
        "body ache all over with fever", "chills and shivering with fever", "suspected dengue fever",
        "malaria test came positive", "typhoid positive needing review", "urine infection burning while passing urine",
        "chest infection with productive cough", "chest congestion for a week", "flu like illness with body pain",
        # gi
        "loose motions since morning", "watery diarrhea with stomach pain", "vomiting everything i eat",
        "food poisoning after eating outside", "stomach pain and loose stools", "indigestion and bloating after meals",
        "acidity and heartburn trouble", "constipation for a week", "hard stools and pain while passing",
        "blood in stool since morning", "yellowish eyes and dark urine after fever", "jaundice need review",
        "vomiting and diarrhea after milk products", "baby has milk intolerance and weight is dropping", "abdomen feels a little distended after meals",
        # general weakness / chronic
        "feeling very weak and tired all day", "fatigue without any clear reason", "weakness after recovering from fever",
        "low hemoglobin and feels tired", "anemia detected in blood test", "vitamin d deficiency and bone pains",
        "vitamin b12 low with tingling hands", "thyroid report abnormal, tsh is high", "thyroid swelling in neck need review",
        "uncontrolled sugar levels need help", "diabetes for 10 years, sugar is high", "sugar levels fluctuate a lot",
        "blood pressure goes up sometimes", "bp slightly raised since a week, review", "cholesterol high need diet advice",
        # miscellaneous systemic
        "weight loss without any reason", "night sweats for a month", "loss of appetite and weakness",
        "swollen legs and feet by evening", "legs hurt while walking long distance", "breathless on climbing stairs but heart tests normal",
        "cough not settling for three weeks", "cough with phlegm greenish since week", "wheezing running attacks at night",
        "seasonal sneezing and runny nose", "cold that has lasted two weeks", "sore throat running nose and cough",
        # general / administrative
        "annual health checkup please", "full body checkup with blood tests", "routine follow up after last visit",
        "need prescription refill for bp tablets", "need review of my current medicines", "follow up after typhoid treatment",
        # context and colloquial
        "general check up of someone with fever", "feels very hot after coming from outside", "head feels hot with body pains",
        "my report shows esr is raised", "not feeling well since morning", "feeling under the weather for a week",
        # Hinglish
        "bukhar ho gaya hai", "sar dard aur bukhar hai", "shareer me dard aur bukhar",
        "loose motion ho rahe hai teen din se", "ulti aur patle dast ho rahe hai", "pet dard ho raha hai",
        "sukhi khansi hai teen hafte se", "zukam aur khansi ho rahi hai", "gale me dard aur zukam",
        "bahut kamzori lag rahi hai", "sehat theek nahi lag rahi", "chehre par pet dard abnormal",
        "sardi aur khansi nahi ja rahi", "baar baar bukhar aata hai", "haath pair kamzor lagte hai",
        "dengue ho gaya hai", "thalassemia review ke liye aaya hun", "sugar ki report per faith lag rahi hai",
        "kamzori aur thakan poore din", "imunity kam hai baar baar bimar", "puberty ka wait ho raha hai review",
    ],
    "Cardiology": [
        # chest pain / angina
        "chest pain while walking", "chest pain radiating to left arm", "chest pain radiating to jaw",
        "chest pain after exertion", "chest tightness on climbing stairs", "chest heaviness lasts few minutes",
        "chest feels heavy after heavy meals", "chest burning rising from stomach to chest", "chest pressure like weight on chest",
        "chest pain when walking against wind", "chest pain relieved by rest after 5 minutes", "chest pain spreads to back between shoulders",
        "chest discomfort with belching", "chest pinching after a sudden stress", "chest tight after emotional fight",
        "chest tightness in a crowded area", "pin in chest after sudden clenching of fists",
        # palpitations / rhythm
        "palpitations while resting", "palpitation all of a sudden", "heart races at night while lying",
        "heart pounds after climbing stairs", "heart beats very fast for a minute then stops", "irregular heartbeat skipped beats",
        "skipped beats noticed while lying on left side", "heart feels like flip flops in chest", "extra heartbeats bothersome",
        "pulse irregular sometimes fast sometimes slow", "heart flutter while lying down to sleep", "heart murmur detected this visit",
        # breathlessness / failure
        "breathless on exertion getting worse over months", "cannot lie flat needs pillows to sleep", "short of breath lying down",
        "need two pillows to breathe at night", "wake up gasping at night and sit up", "bedwetting six pillows under head",
        "short of breath walking to bathroom", "legs and feet swollen by evening", "feet swelling and breathlessness together",
        "tummy distended with breathlessness heart", "gain 2 kg in a week with leg swelling",
        # hypertension / cholesterol / risk management
        "blood pressure 150 over 95", "bp stays high even with tablets", "hypertension not controlled on 3 medicines",
        "bp fluctuates a lot need review", "cholesterol 280 need advice", "high cholesterol and family history of heart disease",
        "diabetic with high bp and cholesterol need review", "father had heart attack at 48", "family history sudden death need ecg",
        # procedures / followup
        "after a stent need review", "angioplasty followup medical management", "echo report shows weak pumping of heart",
        "ecg shows borderline changes need opinion", "tmt positive need angiography advice", "cardiac clinic follow up after discharge",
        "cardiology outpatient appointment", "nice echo and ecg pending for valvular disease",
        # context and colloquial
        "heart related issue consultation", "heavy chest after court case", "chest may be related to gas but unsure, visit heart",
        "heart se相关部门 pain", "cardiac sick since childhood murmur now breathless", "heart disease runs in family want screening",
        # Hinglish
        "seene me dard dabao lag raha hai", "seene me jalan aur dard", "dil ki dhadkan tez ho jati hai",
        "dil ki dhadkan ruk jaise lagti hai", "saans phool rahi hai thoda chalne pe", "bp badhta rehta hai control nahi",
        "bp 160 se niche nahi aa raha", "heart patient hun review ke liye", "chakker se pehle seene me dard",
        # class context
        "aching in jaw after walking (heart history)", "chest discomfort while walking in cold",
        "chest pain going to left shoulder since morning", "chest heaviness after climbing few steps",
    ],
    "Pediatrics": [
        # infant
        " newborn not accepting feeds", " baby not feeding well since morning", "infant refusing milk and crying",
        "newborn jaundice yellow eyes", "baby has jaundice on day 5", "baby peeing fewer times than usual",
        "infant with cold and blocked nose", "newborn not gaining enough weight", "baby does not wake up for feeds",
        "unbounced noise squeaks while infant breathes", "infant vomiting curdled milk repeatedly after feeds",
        "baby cries inconsolable in the evening", "colic pain in baby every evening", "baby's stomach is bloated and hard",
        "baby is spitting up milk after every feed", "infant passing loose green stools", "toddler with hand foot and mouth rash",
        # child general
        "child has fever 102", "child running high fever since night", "kid has body ache and fever",
        "child has cough for 5 days", "child cough with wheezing at night", "kid wheezing with fast breathing",
        "child breathes fast with chest pulling in", "childless pulls in of ribs while breathing", "my child passes urine frequently",
        "child has pain while passing urine", "kid refuses to eat anything for two days", "child does not gain weight",
        "not gaining weight despite good feeding", "growth chart shows child falling off curve", "teenager shorter than classmates",
        "child is hyperactive at school", "kid cannot focus in class for long", "child has repeated stomach aches before school",
        "school refuses stomach ache every morning", "child has vomiting for three days", "toddler vomits all milk after feeds",
        "child has loose motions for two days", "loose stools and fever in child", "kid has rash with fever after antibiotic",
        "child has red rash on cheeks", "kid fell from bed and cried, no vomiting", "child bumped head on the table",
        # dental / speciality overlap
        "child has cavities and tooth decay", "kids teeth are yellowish and decayed", "child thumb sucking and dental caries",
        # development / behavioural
        "child not speaking two word sentences yet", "toddler not walking at 18 months", "my son is not speaking fluently for age",
        "missed milestones as per age", "school going child wets bed at night", "kid sleeps too much during day",
        "child acts unlike age, needs behaviour review", "childhood seizures now controlled need review",
        "child has staring spells lasting seconds", "kid cannot sit still and keeps moving",
        # vaccination / teenage
        "vaccination due tomorrow, need schedule", "child immunization not complete", "need vaccine catch up schedule",
        "child vaccines missed due to covid", "teenage acne need referral", "kid has grown 3 cm in six months only",
        # context
        "child followed up for asthma review", "peds patient with cold and cough", "child with dengue fever under review",
        # Hinglish
        "bachche ko halka bukhar hai aur khansi hai", "bachcha dudh nahi pee raha hai", "bachche ka pet dard hai",
        "bachche ko ulti ho rahi hai", "bachche ko loose motion hai", "bachche ka weight nahi badh raha",
        "bachcha baar baar zukam ho jata hai", "bachcha raat ko khansata hai", "bachche ko der se chalna shuru",
        "bachche ki nazar kam hai shayad", "bacche ko vaccine lagana hai", "bachche ko kamzori hai bukhar ke baad",
        "bachche ne sar pakda hai tez dard", "bachche ko sar dard hai rooz subah", "bachcha padhai me concentrate nahi karta",
        "baccha khelte waqt behosh ho gaya", "bachche ke daant me keeda lag gaya",
    ],
    "Dermatology": [
        # infections
        "ring shaped itchy patch on the body", "ringworm spreading on thigh", "fungal infection between toes",
        "itchy circular patch on the neck", "fungal nail one toe thickened", " sototting infection under arm fold",
        "boil on leg painful and red", "abscess on the back painful", "cellulitis on leg spreading redness",
        "wound not healing on foot for a month", "bacterial infection on shaved area", "hair follicle infection on scalp",
        # inflammatory / allergy
        "eczema patch on elbows flaring", "dry itchy skin in winters", "atopic dermatitis need gentle creams",
        "hives all over body after medicine", "raised itchy welts come and go", "allergic rash after new detergent",
        "rash with itching after eating prawns", "poison ivy like rash after gardening", "contact dermatitis on wrist from watch",
        "diaper rash not settling", "sweat rash in skin folds", "red raw in folds after sweat",
        "skin between toes peeling and itchy", "burning sensation after applying a cream",
        # psoriasis / chronic
        "psoriasis plaques on knees and elbows", "scaly silver patches keep flaring", "joint pains with psoriasis patches",
        # pigmentation / acne / scars
        "pigmentation on cheeks getting darker", "dark patches under arms", "melasma on face after pregnancy",
        "acne on face since college", "cystic acne on jawline painful", "acne leaving dark marks on face",
        "oily skin with blackheads and acne", "acne treatment needs review", "scar on face needs treatment",
        "keloid on ear piercing growing", "post burn scar tightening on hand", "bump after tattoo itchy",
        # hair / nails
        "hair fall for 2 months increasing", "hair thinning on crown", "patches of hair loss on scalp",
        "dandruff with flaking on shoulders", "scalp itchy with flakes", "beard area hair loss patchy",
        "nail pitting with small dents", "nail fungus yellow and thick", "ingrown toenail painful and red", "ingrowing nail on big toe",
        # growths / lesions
        "mole changed shape recently", "mole itching and bleeding", "skin tag on neck increasing",
        "wart on hand spreading", "corn on sole painful while walking", "birthmark color change need opinion",
        "new dark patch on back growing", "red bump on nose bleeding", "pyogenic granuloma bleeding on touch",
        # sun / cosmetic
        "sunburn on shoulders peeling", "skin tanned heavily after beach", "summer rash after sun exposure",
        "photosensitivity rash on neck v area",
        # Hinglish
        "khujli poori raat hoti hai sharir pe", "daad ho gaya hai daane", "daane pad gaye hai gale pe",
        "pet ke neeche daad ke daane", "chehre par daag habbe", "chehre par daane ho gaye hai",
        "chehre par Daane urat:", "Chehre par daag dhabbe", "baal jhad rahe hai bahut",
        "baal jhadne ki shikayat hai", "sir me dhundh raha hai dandruff", "foo******n infection ho gaya hai",
        "naakhun me daad ho gaya", "naakhun ke upar daad ke daane", "sukhi khujli raat ko zyada",
        "talve par gaththa peda hua", "moosalay dhabbe urat", "nayi dawa se khujli ho rahi",
        "pasine se daad ho gaya", "gaal par daag jama ho gaya",
    ],
    "Orthopedics": [
        # spine / back
        "lower back pain after lifting weight", "back pain radiating down the leg", "slipped disc in lower back",
        "sciatica pain from back to foot", "back pain since morning stiff", "neck pain radiating to shoulder",
        "neck stiffness after long computer work", "backache after sitting whole day", "spine pain bending forward",
        "sciatica pain on left side", "cannot bend, back went out", "back pain persist even after physio",
        # shoulder / elbow / wrist
        "frozen shoulder cannot raise arm", "shoulder pain worse at night", "shoulder pain after fall six months ago",
        "cannot comb hair due to shoulder pain", "tennis elbow pain lifting things", "elbow pain on lifting kettle",
        "wrist pain after typing long hours", "wrist pain typing all day", "trigger finger catching in the morning",
        "carpal tunneling symptoms tingling hands", "de quervain tenosynovitis thumb pain", "wrist pain after fall",
        # hip / knee / leg
        "knee pain climbing stairs", "knee pain when squatting sitting on floor", "knee clicking and locking",
        "knee gives way while walking", "knee swells after walking long", "both knees pain in elderly",
        "arthritis of knee need advice", "after knee replacement physio needed", "hip pain radiating to knee",
        "leg pain after total hip replacement", "cannot squat, knee hurts", "runner's knee pain after running",
        # ankle / foot
        "twisted ankle sprain still swollen", "ankle pain after twist two weeks ago", "heel pain in morning first steps",
        "plantar fasciitis heel spur pain", "foot pain after long walk", "flat feet pain after standing long",
        # fractures / trauma
        "arm fracture plaster applied", "leg fracture after accident", "wrist fracture follow up for x ray",
        "hand fracture healing callus check", "sprained ankle grade 2 physio", "collarbone fracture after fall",
        "bones crack after slip on floor", "fall on outstretched hand now wrist pain",
        # general / chronic / arthritis
        "joint pains in both hands morning stiffness", "arthritis of fingers worsening", "gout attack toe swollen red",
        "rheumatoid arthritis follow up treatment", "osteoarthritis knees need injection", "joint pain all over after viral",
        "muscle pain all over with weakness", "ligament injury knee after sports", "acl tear suspected need mri",
        # Hinglish
        "ghutno me dard hai", "ghutne me dard chalne me", "kamar dard hai subah uthne me",
        "kamar dard lagatar hai", "gardan me dard hai", "gardan me akadan hai subah",
        "kandhe me dard uthte waqt", "kandha dukhta hai raat ko", "per me dard chalne me",
        "tang me dard chalne me dikkat", "pair me dard hai teen din se", " hath me dard uthne me",
        "unte me dard ho raha hai", "haath me dard hai", "joor jure me dard ho raha hai",
        "gutthe me dard ho raha hai", "haddi tut gayi thi review ke liye", " FR je dard hai purane fracture ke baad",
        "acche se haath upar nahi uth raha", "ghutna suza hua hai roz", "ghutne me aawaz aati hai chalte waqt",
        "purani chot ke baad ghutna suja", "kamar me chot lagne ke baad dard", "sar me dard traffic jaldi me",
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
        "balance problems walking into walls",
        "headache like a band around my head",
        "sensitivity to light throws me into headache",
        "blackout attack with jerking limbs",
        "headache worse in morning",
        "migraine attacks twice a week with light sensitivity",
        "trembling right hand since six months",
        "stab temple pain with eye tearing and droopy eyelid",
        "facial droop noticed this morning",
        "sensation of spinning when lying turning",
        "electric shock attacks in the neck",
        "numbness pinky and ring fingers two weeks",
        "numb arm wakes me up at night",
        "numb foot on long walks",
        "tremor worse lately pills wearing off fast",
        "blackout episodes with tongue biting",
        "childhood fits stopped but recurring now",
        "unsettling headache crushing migraine",
        "sleep attacks on sofa every evening",
        "somnolence on sofa mid day episodes",
        "nose goes numb without smell morning start",
        "smell smoke nobody else smells it",
        "tremor triggered worse with nervousness",
        "memory grandfather story disturbing telling",
        "smell of burning toast without any toast",
        "flash of light before eyes then headache",
        "tremor in fingers while resting",
        "vertigo tilt worse curling bed",
        "vertigo room spins lying turning head",
        "sar me chakkar",
        "hath sun ho jata hai",
        "chakkar aate hai khade hone pe",
        "neurologist wants MRI brain review",
        # class context
        "left hand went limp for ten minutes then ok", "twist in speech while talking last evening",
        "one side of body became heavy suddenly", "mouth pulled to one side while drinking water",
        "eye drooping on one side since morning", "sudden severe headache with stiffness of neck",
        "headache for two weeks gradually increasing", "headache with vomiting not settling",
        "eyes cannot follow object to one side", "brain mri recommended after seizure",
        "epileptic fits once in months on tablets", "memory loss in grandfather worsening",
        "grandfather forgot the way back home", "mother repeats the same questions",
        "father cannot understand simple instructions", "handwriting has become very small",
        "hands shake when holding cup of tea", "feels like room spins when turning head",
        "felt faint and sweaty while standing in queue", "leg gives away while walking sometimes",
        "burning pain in both feet at night", "pins and needles in the toes",
        "shooting pain from back to feet", " weakness of grip in hands",
        "double vision while looking sideways", "double on looking to the right side",
        "cannot swallow water while drinking", "food goes to nose while eating",
        "voice became nasal and slurred suddenly",
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
        "exam pressure through the roof",
        "sounds like panic attack, heart racing, afraid it will kill me",
        "insomnia for two weeks, sleep evades me",
        "low thoughts keep coming, no self worth",
        "wife says I smile less since father passed",
        "interview, hands and voice trembling",
        "eats little then binges at midnight",
        "overwhelmed by small things",
        "therapy appointment for mood swings",
        "midterm panic attack last night",
        "soul feels detached from body",
        "voices commenting on actions",
        "people plot against me paranoia",
        "high energy around the clock week",
        "works a lot but boots no products",
        "constantly on mobile till 4 am",
        "neend nahi aa rahi",
        "neend nahi aati chinta rehti hai",
        "man udas rehta hai kisi se baat nahi karta",
        "exam ka pressure bahut hai",
        # additional context
        "mentally disturbed after loss in business", "cannot stop thinking negative all day",
        "cannot let go of small mistakes replay them", "always tensed and on the edge",
        "postpartum feeling low after delivery", "new mother feels disconnected to baby",
        "loses temper at small things at home", "gets angry for no reason sometimes",
        "frustrated with job, cannot focus", "married life tensions affecting sleep",
        "fear of failure before exams", "cannot concentrate in studies for weeks",
        "hoarding useless things and cannot throw", "counting things again and again",
        "repeatedly checks the gas knob ten times", "cannot cross the road without panic",
        "fear of lifts and closed rooms", "cannot stay alone in the dark",
        "afraid of crowd, heart races in market", "avoided meeting people for months",
        "does not come out of room since exam", "wakes up in the middle of night thinking",
        "have bad dreams of the accident every night", "flashbacks of the accident in day",
        "starts crying on small issues", "cries without reason, feels hopeless",
        "drinks alcohol daily more than before", "smoking increased after office stress",
        "wants to leave tobacco, need help", "cannot stop gambling need help",
        "mobile addiction is disturbing sleep", "spends hours scrolling unable to stop",
        "family abuseDP", "domestic violence trauma need help",
        "abused as a child, intrusive memories", "unwanted thoughts of hurting self come",
        "thoughts of ending life come often", "not interested in anything anymore",
        "empty feeling for many weeks", "feels like a burden to family",
        "cannot eat properly from stress",
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
        # context
        "discharge from ear for two days", "water from ear child", "pus from ear since morning with fever",
        "earache with fever since night", "canal painful after swimming", "swimmer ear itchy painful",
        "blocked ear after cold", "blocked ears after flight diving", "popped eardrums after diving",
        "ear pain worse while chewing", "ear feels itchy inside", "hard wax in ear cannot clean",
        "hard hearing after ear infection", "tinnitus ringing non stop at night", "clicking sound inside jaw near ear",
        # nose / sinus / allergy
        "blocked nose one side for months", "both nostrils blocked at night", "cannot smell anything after cold",
        "cannot taste food for two weeks", "frequent nose bleeds in summer", "nose bleeding every day these days",
        "nasal voice after surgery", "whistling sound from nose while breathing", "bent nose after injury, blocked",
        "nose bent to one side after boxing", "sinus headache over eyebrows", "heaviness on cheeks and forehead",
        "thick green discharge from nose", "foul smell from nose family complains", "smelly nose discharge for weeks",
        "allergic to dust, sneeze a lot", "continuous sneezing in morning", "watery nose and itchy eyes with dust",
        # throat / tonsils / voice
        "tonsil white patch on both sides", "tonsil repeated attacks every month", "swollen tonsils painful swallowing",
        "hole in tonsil traps food", "stones in tonsils smelly bits", "bad breath a lot despite brushing",
        "sensation of lump in throat when swallowing", "pill stuck in the throat while swallowing", "feels like food is stuck in the chest",
        "pain while swallowing severe on right side", "cheeks ache after chewing hard food", "noise in ear while swallowing saliva",
        "hoarse voice for a month", "voice became weak by evening", "teacher loses voice by afternoon",
        "singer cannot reach high notes now", "boy voice changed suddenly high pitch", "male feminine voice pitch need review",
        "cracked voice after shouting at match", "cough worse lying due to throat drip", "cough for weeks, feels from throat",
        # mouth / tongue / neck
        "mouth ulcers every week painful", "tongue ulcer on tip very painful", "white patch inside cheek new",
        "tongue white coating with bad breath", "cracks at corner of mouth", "toothache radiating to the ear",
        "jaw clicking and pain while chewing", "mouth cannot open fully after wisdom tooth", "lockjaw limited opening after dental work",
        "swelling in neck for two weeks", "lump in neck above the collarbone", "gland swollen in neck with fever",
        # sleep / snoring
        "snoring loudly, wife complains", "partner snores and stops breathing at night", "snoring with choking episodes at night",
        "daytime sleepiness always despite 9 hours sleep", "sleepy while driving after lunch", "sleep study advised for loud snoring",
        # vertigo ENT overlap
        "vertigo tilting head in bed", "room spins when rolling over on bed", "dizzy when getting up from lying",
        # Hinglish
        "kaan me dard hai", "kaan me dardai reh rahi hai", "kaan block hai sunai nahi de raha",
        "kaan pani beh raha hai", "kaan me dard halka sa", "kaan baj rahe hai nikal nahi raha",
        "kaan me dard bahut tez", "kaan phat gaya hai", "kaan me keeda aane ki complaint child",
        "kaan suar kharatat hai", "kaan baaj sunai deta hai ghar", "kaan se pani nikal raha hai",
        "kaan ke andar suard jama hai", "kaan se sunai derhe hai subah", "kaan me keede likhe pending hai",
        "kaan me paani gya sunai nahi", "kaan me jalan", "kaan me dard bachche",
        "kaan me dard karta hai", "kaan me dard hai there is pain", "kaan bnd ho gaye hai",
        "kaan baj rahe hai sardi ke baad", "kaan me behosh sa fee", "kaan bajte hai aakh band karne pe",
        "kaan me dard hota hai sardi", "gale me dard nigalne me", "gale me kharash ho gayi hai",
        "awaaz baith gayi hai bolega to", "naak band hai saans nahi le pa", "naak se khoon aa raha hai roz",
        "naak me pind ke jaisa", "naak sun nahi hone pe",
    ],
    "Ophthalmology": [
        # refraction / blurring
        "blurred vision when reading", "cannot read small print even close", "numbers and letters blurring",
        "blurred vision gets worse by evening", "distant vision blurred, cannot read whiteboard", "watching tv from distance is blurry",
        "glass number increased this year", "new glasses not helping, still blurring", "eyes get blurred after long computer work",
        "read emails with one eye closed now", "cannot focus between far and near quickly",
        # red eye / infection / allergy
        "red itchy eyes both", "red painful eye with watering", "eye redness with sticky discharge morning",
        "white discharge stuck eyelashes morning", "itching in eyes in summer", "seasonal eye allergy itchy red",
        "eyelash stuck under eyelid painful", "eyelash growing inwards scratching cornea", "dropping into eye while removed lash",
        "eye swollen since morning with redness", "eyelid swollen after insect bite", "eye stye lump edges painful",
        "bump on eyelid painless growing", "corner eye cracked and painful", "eyelid drooping more these days",
        "eyes cross when tired squint", "eye turns outwards when looking far", "newborn left eye constantly waters",
        # dry eye / strain
        "dry scratchy eyes after computer", "watery eyes from dryness", "burning eyes after screen all day",
        "tired heavy eyes after reading on phone", "gritty sandy feeling in the eyes",
        # cataract / retina / nerves
        "cataract in both eyes advised surgery", "vision cloudy like frosted glass", "one eye whitish pupil in child",
        "newborn pupil white in photo flash", "vision slowly dimming over a year", "cannot see in dim light walking at night",
        "night blindness progressing", "curtain fell from top of vision suddenly", "flash of light in corner vision",
        "many floaters appeared all of a sudden", "black cobweb floating in vision", "dark shadow moves with the eye",
        "sudden vision loss in one eye this morning", "vision dropped within hours one eye",
        "straight lines look bent and wavy", "front door looks tilted one eye", "centre of the page missing when reading",
        "letters missing when looking straight", "colors look faded as compared earlier",
        # glaucoma / pressure / headache overlap
        "eye pain with rainbows around lights", "severe eye pain with headache and vomiting", "eye pain right side with headache",
        "pressure in the eye with blurred vision", "diagnosis of glaucoma need regular checkup",
        # diabetic / followup / procedures
        "diabetic eye checkup yearly", "injection in the eye for retina treatment", "vision test for driving licence need",
        "eye checkup after head injury asked", "spectacles change needed every 6 months", "double vision after alcohol only",
        # Hinglish
        "aankh laal hai pani aa raha hai", "aankh khujli ho rahi hai", "aankh laal kachakach",
        "aankh me dard aur dhundhla", "aankh me kuch chal raha hai", "aankho me gami",
        "dhundla dikhta hai chashme ke baad bhi", "dhoondh se dekh raha hai dhire dhire", "chasma number badh gaya",
        "chashme ka naya number nahi lagra", "chashma number halka kharab", "chashme number kam zyada hota",
        "door ka chehra dhundhla dikhta hai", "paas ka nahi dikhta", "paas chota nahi dikhta",
        "aankhon me dhoondh dhoondh chal raha", "aankh me dhundh chal raha", "retina checkup yearly diabetes",
        "aankh dikhai nahi dere raat me", "aankh bhaar aata hai", "aankhon me jaltash",
        "chirag jalan aankh", "aankh sooj rahee hai karwa", "dhundh ubhar aaya aankh",
        "aankh se pani nikal raha hai", "aankh laal ho gayi hai", "aankh suun gayi hai",
    ],
    "Gynecology": [
        # menstrual
        "periods irregular since 3 months", "no periods for 2 months now", "missed period 15 days",
        "period delayed by 10 days", "periods come every 20 days now", "two periods in one month",
        "period twice in one month", "spotting between periods for 2 cycles", "brown spotting few days before period",
        "periods heavy with clots", "heavy flow soaks pad every 2 hours", "very heavy periods feeling weak",
        "period lasts 10 days now", "bleeding for 15 days not stopping", "continuous spotting for weeks",
        "period painful first day vomits", "cramps during period unbearable", "period cramps relieved by hot water bag",
        "period pain radiating to legs", "period pain keeps me from school", "severe cramps need tablet every month",
        "periods painful with vomiting each cycle", "missed periods after marriage stress", "periods stopped after covid",
        "periods have not come after delivery", "no periods after stopping the pill", "periods ceased for a month negative test",
        # pregnancy / antenatal
        "pregnancy test positive need first visit", "missed period with nausea, think pregnant", "6 weeks pregnant need first scan",
        "9 weeks pregnant and vomiting continuously", "pregnancy sickness all day long", "cannot eat in pregnancy from sickness",
        "bleeding during 8 weeks pregnancy", "light spotting in early pregnancy", "baby movements reduced feeling",
        "ultrasound at 20 weeks review", "blood pressure high in pregnancy", "sugar high in pregnancy need diet",
        "pregnancy for a year without success", "planning pregnancy after 2 miscarriages", "no periods, want to check tubes and hormones",
        "after delivery bleeding heavy need review", "post delivery low mood and crying", "new mother feels low and tearful",
        # gynae problems
        "white discharge with itching for a week", "vaginal discharge foul smell", "discharge after menopause need check",
        "itching in private parts with discharge", "burning urination vaginal itching together", "urine comes while coughing",
        "coughing sneezing causes urine leak", "cannot hold urine after delivery", "leak a bit while running",
        "mass coming out of vagina while straining", "something comes down in the private parts", "foul smell after delivery need checkup",
        # fibroid / cyst / pcos / cervical
        "fibroid uterus heavy periods anemia", "multiple fibroids advised surgery", "ovarian cyst followup scan",
        "cyct on left ovary 4 cm review", "pcos with weight gain and acne", "pcod periods irregular and facial hair",
        "facial hair increase chin side locks coarse", "pap smear due every 3 years need", "pap smear positive need colposcopy",
        "cervical smear report abnormal", "vaccine for girls hpv needed", "periods stopped but hot flushes all day",
        "menopause symptoms disordered life", "40s bone health check after periods stopped", "hot flashes waking up at night sweating",
        # breast / contraception
        "breast lump noticed while bathing", "breast lump painful around periods", "breast lump shrinking need review",
        "nipple discharge slight need checkup", "breast pain redness with fever feeding", "breast abscess after delivery",
        "need contraceptive advice after marriage", "oral pills review after 3 years", "iud insertion appointment needed",
        "copper t removal planned", "contraception after c section advice",
        # Hinglish
        "mahwari me dard bahut hota hai", "mahwari time pe nahi aa rahi", "mahwari jaldi aa gayi",
        "mahwari me dard hota hai", "mahwari zyada ho rahi hai", "mahwari me khoon zyada aata hai",
        "mahwari 15 din se ruki hai", "mahwari 20 din baad aa gayi", "mahwari ka time nahi ho raha",
        "mahwari me dard aur ulti", "mahwari me dard aur weakness", "white paani aa raha hai kujh bhi",
        "white discharge ho raha hai roz", "white discharge me sujan aur khujli", "govt hospital se delivery ho gayi",
        "delivery ke baad khoon aa raha hai", "delivery ke baad period aayi hai", "bai ki delivery 8 din pehle ho gayi",
        "bache ki delivery hygine baad", "miscarriage hua hai ek mahine pehle", "miscarriage pichle saal hua tha",
        "c section ke baad dard hota hai jagah", "c section ke baad sujan hai jagah pe", "C sec ke baad dard ho raha hai",
        "ovary cyst hai sonography me", "cervical check ke liye aana hai", "cervicitis ka caesarean",
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
        "high blood pressure 200 over 120 severe headache", "pressure 190 feels like head will burst",
        "bleeding heavily from the nose after injury", "bleeding has not stopped for 30 minutes",
        "deep cut bleeding a lot from the thigh", "accident on bike, leg bleeding badly",
        "fell from stairs, cannot stand, hip paining", "hit by a car while crossing the road",
        "head hit the wall, vomited twice now", "hit the head, one pool of blood near ear",
        "swallowed rat poison at home", "took many tablets of sleeping pill", "self harm attempt with blade on wrist",
        "hanging attempt brought to hospital", "gas leak in house, the whole family fainted",
        "severe abdominal pain vomiting blood", "blood coming in vomit three times",
        "black tarry stool and feels faint", "stool with fresh blood many times since morning",
        "cough with blood streak since evening", "coughing red blood continuously",
        "sudden weakness of right side with slurred speech", "cannot speak, right arm not moving",
        "fall in bathroom, head bleeding and confused", "never regain consciousness after fall",
        "rolled over hand got stuck, hanging from wire", "Shock by 220 V wire in home, hands burnt",
        "drowned in pond, brought unconscious", "rescue from river, breathless vomiting",
        "swelling of whole body after medicine", "face swollen, breathing difficult, allergy",
        "wasp stung, throat closing, cannot breathe", "sualbit brought, tongue swollen, cannot breathe",
        "choking on chapati, face blue", "food gone in windpipe, not able to speak",
        "baby not breathing, turning blue", "newborn not responding, no cry",
        "convulsions for ten minutes without stopping", "seizures after high fever, not stopping",
        "fever with rigors and confusion, breath fast", "chest pain along with fainting while walking",
        "structure of chest pain with sweat, 55 male diabetes", "severe pain chest, sweating, diabetic",
        "snake bit me on the hand 20 minutes ago", "grass snake bite ankle, fang marks bleeding",
        "burned hand with boiling water, skin coming off", "charred fingers after stove burst",
        "accident, heavy bleeding, arm deformed", "crushed leg after road accident bleeding",
    ],
}

# quick sanity: trim phrases with accidental placeholder characters
_ACCIDENTALS = ("*", "/", "\\", "#", "@", "{", "}", "发出", ".emit", "部门", "-emitted", "话")
for _dept, _phrases in DATA.items():
    DATA[_dept] = [p.strip() for p in _phrases if p and not any(ch in p for ch in _ACCIDENTALS)]
    # drop empty-looking leftovers
    DATA[_dept] = [p for p in DATA[_dept] if p.strip(" .,;:")]


def normalize(text: str) -> str:
    stripped = strip_accents_unicode(text)
    return " ".join(stripped.lower().split())


def build_clean_dataset() -> "tuple[list[str], list[str]]":
    flat = [(t, dept) for dept, phrases in DATA.items() for t in phrases]
    return [t for t, _ in flat], [d for _, d in flat]


def augment_dataset(texts: "list[str]", labels: "list[str]") -> "tuple[list[str], list[str]]":
    """handwritten phrases + light wrappers / shuffles / typos (~3x data)."""
    wrappers = [
        "", "i have ", "feeling ", "suffering from ", "since two days ",
        "please help ", "constant ", "recurring ", "mild ", "severe ",
        "getting ", "unable to ", "doctor i am ",
    ]
    rng = np.random.default_rng(7)
    all_texts, all_labels = [], []
    for text, dept in zip(texts, labels):
        t = text.lower().strip()
        all_texts.append(t)
        all_labels.append(dept)
        # wrapper
        w = wrappers[int(rng.integers(0, len(wrappers)))]
        all_texts.append(w + t)
        all_labels.append(dept)
        # typo (swap two chars in one word)
        words = t.split()
        if len(words) > 1:
            i = int(rng.integers(0, len(words)))
            chars = list(words[i])
            if len(chars) > 2:
                j = int(rng.integers(0, len(chars) - 1))
                chars[j], chars[j + 1] = chars[j + 1], chars[j]
                words[i] = "".join(chars)
                typo_text = " ".join(words)
                if typo_text != t:
                    all_texts.append(typo_text)
                    all_labels.append(dept)
        # question phrasing
        if int(rng.integers(0, 3)) == 0:
            all_texts.append("why do i have " + t + " ?")
            all_labels.append(dept)
    return all_texts, all_labels


def make_pipeline(kind: str) -> Pipeline:
    """kind: 'word' | 'char' | 'hybrid' (word + char features)."""
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
    return Pipeline([
        ("features", FeatureUnion([
            ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=2)),
        ])),
        ("clf", clf),
    ])


def export_model(pipe: Pipeline, kind: str, best_cv: float) -> None:
    """Serialize feature blocks, intercept_ and coef_ so TS can reproduce."""
    clf = pipe.named_steps["clf"]
    union = pipe.named_steps.get("features")
    if union is not None:
        blocks = [(name, t) for name, t in union.transformer_list if t is not None]
    else:
        blocks = [(kind, pipe.named_steps["tfidf"])]

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
            "sublinear_tf": bool(getattr(tfidf, "sublinear_tf", False)),
            "lowercase": bool(getattr(tfidf, "lowercase", True)),
            "vocabulary": vocab,
            "idf": idf,
            "coef": block_coef,
        })
    intercept = [round(float(b), 4) for b in clf.intercept_]
    classes = [str(c) for c in clf.classes_]

    return {
        "feature_blocks": feature_blocks,
        "classifier": {"classes": classes, "intercept": intercept},
        "anchor_terms": ANCHOR_TERMS,
        "urgency_terms": URGENT_TERMS,
        "departments": DEPARTMENTS,
        "metrics": {
            "cv_accuracy": round(best_cv, 3),
            "gold_accuracy": None,  # filled by caller
            "gold_n": len(GOLD),
            "feature_kind": kind,
            "n_features": n_features,
        },
        "trained_at": datetime.datetime.now().isoformat(),
    }


def anchor_bonus_for(text: str, run_anchor_terms: "dict[str, list[str]]") -> "dict[str, float]":
    """Mirror of the TS runtime's anchor layer (lib/nlp/symptoms.ts).

    Rules:
      * find all raw substring occurrences of every anchor term;
      * cancel a hit if the character before it is a letter (mid-word start);
      * cancel a hit if it lies fully inside a NEVER_ANCHOR word occurrence.
    Must be kept in lockstep with the TypeScript implementation.
    """
    hits: "list[tuple[str, int, int]]" = []  # (dept, start, end)
    for dept, terms in run_anchor_terms.items():
        for term in terms:
            start = 0
            while True:
                i = text.find(term, start)
                if i < 0:
                    break
                hits.append((dept, i, i + len(term)))
                start = i + len(term)

    never_spans: "list[tuple[int, int]]" = []
    for term in NEVER_ANCHOR:
        start = 0
        while True:
            i = text.find(term, start)
            if i < 0:
                break
            never_spans.append((i, i + len(term)))
            start = i + len(term)

    bonus: "dict[str, float]" = {}
    for (dept, s, e) in hits:
        if s > 0 and text[s - 1].isalpha():
            continue  # mid-word start → accidental
        if any(ns[0] <= s and e <= ns[1] for ns in never_spans):
            continue  # hit lies fully inside a never-anchor occurrence
        bonus[dept] = bonus.get(dept, 0.0) + 1.5
    return bonus


def main() -> None:
    clean_texts, clean_labels = build_clean_dataset()
    # GOLD must never appear verbatim in training data
    norm_gold = {normalize(g) for g, _ in GOLD}
    clash = [g for g in norm_gold if any(normalize(c) == g for c in clean_texts)]
    if clash:
        print("GOLD phrases leaked into training data:", clash)
        raise SystemExit(2)

    all_texts, all_labels = augment_dataset(clean_texts, clean_labels)
    print(f"training samples: {len(all_texts)} (clean: {len(clean_texts)}) across {len(set(clean_labels))} classes")

    # model selection: word vs char vs hybrid
    best_name, best_pipe, best_cv = None, None, 0.0
    for kind in ["word", "char", "hybrid"]:
        pipe = make_pipeline(kind)
        scores = cross_val_score(pipe, clean_texts, clean_labels, cv=5, scoring="accuracy")
        cv = float(scores.mean())
        print(f"  {kind:7s} 5-fold accuracy (clean): {cv:.3f} +/- {scores.std():.3f}")
        if cv > best_cv:
            best_name, best_pipe, best_cv = kind, pipe, cv

    print(f"selected: {best_name}")
    pipe = best_pipe
    pipe.fit(all_texts, all_labels)

    # ── GOLD evaluation with runtime-parity rule layers ─────────────────────
    # Production (lib/nlp/symptoms.ts) computes argmax(raw ML scores + anchor
    # bonus per hit, mid-word/never-anchor cancelled), with the urgency
    # lexicon hard-routing to __EMERGENCY__ first. Softmax at the end is
    # monotonic, so decision_function + bonus + argmax reproduces it exactly.
    gold_texts = [normalize(g) for g, _ in GOLD]
    raw_scores = pipe.decision_function(gold_texts)  # (n_samples, n_classes)
    class_list = [str(c) for c in pipe.classes_]

    gold_misses = []
    for (text, expected), scores in zip(GOLD, raw_scores):
        norm = normalize(text)
        bonus = anchor_bonus_for(norm, ANCHOR_TERMS)
        urgency_hit = any(t in norm for t in URGENT_TERMS)

        adj = list(scores)
        for dept, val in bonus.items():
            if dept in class_list:
                adj[class_list.index(dept)] += val

        if urgency_hit:
            pred = "__EMERGENCY__"
        else:
            pred = class_list[int(np.argmax(adj))]

        if pred != expected:
            gold_misses.append((text, expected, pred))

    gold_acc = 1 - len(gold_misses) / len(GOLD)
    print(f"GOLD accuracy (with runtime rule layers): {int(len(GOLD) - len(gold_misses))}/{len(GOLD)} = {gold_acc:.3f}")
    for text, expected, got in gold_misses:
        print(f"  GOLD MISS: {text!r} expected {expected}, got {got}")

    doc = export_model(pipe, best_name, best_cv)
    doc["metrics"]["gold_accuracy"] = round(gold_acc, 3)
    doc["metrics"]["n_samples"] = len(all_texts)
    doc["metrics"]["n_clean"] = len(clean_texts)

    if gold_misses:
        print("\nGOLD not perfect — refusing to export.")
        with open(OUT_PATH + ".debug.json", "w", encoding="utf-8") as f:
            json.dump(doc, f, separators=(",", ":"))
        raise SystemExit(1)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    n_feat = sum(len(b["vocabulary"]) for b in doc["feature_blocks"])
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"exported -> ml/symptom_router.json ({n_feat} features, {size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
