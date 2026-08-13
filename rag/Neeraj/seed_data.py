"""
Seed the SQLite database with realistic hospital data.
Run once: python seed_data.py
"""

import sqlite3
import uuid
import random
from datetime import datetime, timedelta, timezone
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "hospilot.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

def uid():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def rand_ts(days_back=30):
    dt = datetime.now(timezone.utc) - timedelta(days=random.randint(0, days_back),
                                        hours=random.randint(0, 23),
                                        minutes=random.randint(0, 59))
    return dt.isoformat()

def recent_ts(hours_back=48):
    dt = datetime.now(timezone.utc) - timedelta(hours=random.randint(0, hours_back),
                                        minutes=random.randint(0, 59))
    return dt.isoformat()

def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def seed():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Create schema
    with open(SCHEMA_PATH, "r") as f:
        cur.executescript(f.read())

    # ── Departments ──────────────────────────────────────────────
    departments = [
        ("ICU", "inpatient", 24, 85),
        ("General Ward", "inpatient", 60, 80),
        ("Private Ward", "inpatient", 30, 70),
        ("Emergency", "emergency", 20, 90),
        ("Paediatrics", "inpatient", 20, 75),
        ("Cardiology", "outpatient", 15, 80),
        ("Orthopaedics", "outpatient", 12, 75),
        ("Neurology", "outpatient", 10, 70),
        ("Obstetrics", "inpatient", 25, 80),
        ("Oncology", "inpatient", 15, 85),
    ]
    dept_ids = {}
    for name, dtype, cap, target in departments:
        did = uid()
        dept_ids[name] = did
        cur.execute(
            "INSERT INTO departments (id, name, type, synced_at, capacity, target_occupancy_pct) VALUES (?,?,?,?,?,?)",
            (did, name, dtype, now_iso(), cap, target),
        )

    # ── Beds ─────────────────────────────────────────────────────
    ward_configs = {
        "ICU": {"count": 24, "room_type": "icu", "ventilation": "positive_pressure", "floor": 2},
        "General Ward": {"count": 60, "room_type": "general", "ventilation": "natural", "floor": 3},
        "Private Ward": {"count": 30, "room_type": "private", "ventilation": "natural", "floor": 4},
        "Emergency": {"count": 20, "room_type": "emergency", "ventilation": "positive_pressure", "floor": 1},
        "Paediatrics": {"count": 20, "room_type": "paediatric", "ventilation": "natural", "floor": 3},
        "Obstetrics": {"count": 25, "room_type": "obstetric", "ventilation": "natural", "floor": 5},
        "Oncology": {"count": 15, "room_type": "oncology", "ventilation": "hepa_filtered", "floor": 2},
    }
    bed_ids = []
    bed_ward_map = {}
    for ward, cfg in ward_configs.items():
        statuses = (
            ["occupied"] * int(cfg["count"] * 0.75)
            + ["available"] * int(cfg["count"] * 0.15)
            + ["maintenance"] * max(1, int(cfg["count"] * 0.05))
            + ["reserved"] * max(1, int(cfg["count"] * 0.05))
        )
        # Pad or trim to match count
        while len(statuses) < cfg["count"]:
            statuses.append("available")
        statuses = statuses[: cfg["count"]]
        random.shuffle(statuses)
        for i, status in enumerate(statuses):
            bid = uid()
            bed_ids.append(bid)
            bed_ward_map[bid] = ward
            cur.execute(
                """INSERT INTO beds (id, branch_id, ward, bed_number, room_type, status, is_active,
                   synced_at, ventilation, floor, wing, noise_level)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (bid, uid(), ward, f"{ward[:3].upper()}-{i+1:03d}", cfg["room_type"],
                 status, 1, now_iso(), cfg["ventilation"], cfg["floor"],
                 random.choice(["North", "South", "East", "West"]),
                 random.choice(["low", "moderate", "high"])),
            )

    # ── Patients ─────────────────────────────────────────────────
    first_names = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh",
                   "Ayaan", "Krishna", "Ishaan", "Ananya", "Diya", "Meera", "Saanvi",
                   "Aarohi", "Priya", "Kavya", "Isha", "Riya", "Nisha", "Rahul",
                   "Amit", "Suresh", "Rajesh", "Pooja", "Sunita", "Kiran", "Deepak",
                   "Neha", "Rohan", "Tanvi", "Sneha", "Manish", "Vikram", "Pallavi"]
    last_names = ["Sharma", "Patel", "Gupta", "Singh", "Kumar", "Reddy", "Joshi",
                  "Verma", "Nair", "Iyer", "Bhat", "Desai", "Rao", "Kapoor", "Mehta",
                  "Chandra", "Pillai", "Menon", "Agarwal", "Mishra"]
    patient_tokens = []
    for i in range(80):
        pid = uid()
        fn = random.choice(first_names)
        ln = random.choice(last_names)
        patient_tokens.append(pid)
        cur.execute(
            "INSERT INTO patients (id, first_name, last_name, uhid, synced_at) VALUES (?,?,?,?,?)",
            (pid, fn, ln, f"UHID-{10000+i}", now_iso()),
        )

    # ── IPD Admissions ───────────────────────────────────────────
    occupied_beds = [bid for bid in bed_ids if bed_ward_map[bid] in ward_configs]
    admission_ids = []
    statuses_adm = ["admitted", "admitted", "admitted", "admitted",
                    "discharged", "transferred", "under_observation"]
    for bid in occupied_beds[:65]:
        aid = uid()
        admission_ids.append(aid)
        ward = bed_ward_map[bid]
        dept_id = dept_ids.get(ward, list(dept_ids.values())[0])
        admitted = rand_ts(14)
        expected = (datetime.fromisoformat(admitted) + timedelta(days=random.randint(2, 14))).isoformat()
        cur.execute(
            """INSERT INTO ipd_admissions (id, patient_token, bed_id, department_id, admitted_at,
               expected_discharge_at, status, synced_at, discharge_ready, discharge_blocked_reason, transfer_pending)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (aid, random.choice(patient_tokens), bid, dept_id, admitted, expected,
             random.choice(statuses_adm), now_iso(),
             random.choice([0, 0, 0, 1]),
             random.choice([None, None, None, "pending insurance clearance", "awaiting lab results"]),
             random.choice([0, 0, 0, 0, 1])),
        )

    # ── Visits (OPD / ER) ───────────────────────────────────────
    complaints = [
        "chest pain", "fever", "headache", "abdominal pain", "breathlessness",
        "fracture", "cough", "back pain", "dizziness", "skin rash",
        "knee pain", "eye irritation", "toothache", "nausea", "fatigue",
        "high blood pressure", "diabetes follow-up", "post-surgery checkup",
    ]
    visit_types = ["walk_in", "appointment", "emergency", "referral"]
    visit_statuses = ["waiting", "in_progress", "completed", "cancelled", "no_show"]
    visit_ids = []
    for i in range(120):
        vid = uid()
        visit_ids.append(vid)
        dept = random.choice(list(dept_ids.keys()))
        cur.execute(
            """INSERT INTO visits (id, patient_token, department_id, arrived_at, status,
               chief_complaint, synced_at, triage_score, visit_type, appointment_id)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (vid, random.choice(patient_tokens), dept_ids[dept], rand_ts(7),
             random.choice(visit_statuses), random.choice(complaints), now_iso(),
             random.choice([1, 2, 3, 4, 5]),
             random.choice(visit_types), None),
        )

    # ── Staff Roster ─────────────────────────────────────────────
    areas = [
        ("icu", "ICU"),
        ("general_ward", "General Ward"),
        ("emergency", "Emergency"),
        ("ot", "Operation Theatre"),
        ("paediatrics", "Paediatrics"),
        ("obstetrics", "Obstetrics"),
        ("oncology", "Oncology"),
    ]
    roles = ["nurse", "doctor", "technician", "ward_boy"]
    shifts = ["morning", "afternoon", "night"]
    for area, label in areas:
        for role in roles:
            for shift in shifts:
                headcount = random.randint(2, 12)
                load = random.randint(1, 8)
                assigned = headcount * load + random.randint(-3, 5)
                cur.execute(
                    """INSERT INTO staff_roster (id, area, area_label, role, shift, headcount,
                       assigned_load, load_per_staff, branch_id, synced_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (uid(), area, label, role, shift, headcount,
                     max(0, assigned), load, uid(), now_iso()),
                )

    # ── Vitals ───────────────────────────────────────────────────
    for aid in admission_ids[:40]:
        for _ in range(random.randint(1, 5)):
            temp = round(random.uniform(36.0, 40.5), 1)
            pulse = random.randint(55, 130)
            sys = random.randint(90, 180)
            dia = random.randint(55, 110)
            spo2 = random.randint(85, 100)
            rr = random.randint(12, 30)
            gcs = random.randint(3, 15)
            is_crit = 1 if (temp > 39.5 or spo2 < 92 or sys > 160 or gcs < 9) else 0
            cur.execute(
                """INSERT INTO vitals (id, patient_token, admission_id, recorded_at, temperature,
                   pulse, bp_systolic, bp_diastolic, spo2, respiratory_rate, gcs, synced_at, is_critical)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (uid(), random.choice(patient_tokens), aid, recent_ts(72),
                 temp, pulse, sys, dia, spo2, rr, gcs, now_iso(), is_crit),
            )

    # ── Lab Orders & Results ─────────────────────────────────────
    test_names = [
        ("CBC", "CBC001", "cells/mcL"),
        ("Blood Glucose", "GLU001", "mg/dL"),
        ("Creatinine", "CREAT01", "mg/dL"),
        ("Liver Function", "LFT001", "U/L"),
        ("Thyroid Panel", "TSH001", "mIU/L"),
        ("Hemoglobin", "HB001", "g/dL"),
        ("Urea", "UREA01", "mg/dL"),
        ("Electrolytes", "ELEC01", "mEq/L"),
        ("Lipid Profile", "LIPID01", "mg/dL"),
        ("D-Dimer", "DDIM01", "ng/mL"),
    ]
    lab_statuses = ["ordered", "in_progress", "completed", "completed", "completed"]
    for vid in visit_ids[:60]:
        oid = uid()
        status = random.choice(lab_statuses)
        cur.execute(
            """INSERT INTO lab_orders (id, visit_id, patient_token, ordered_by, status, priority,
               ordered_at, completed_at, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (oid, vid, random.choice(patient_tokens),
             f"Dr. {random.choice(first_names)}", status,
             random.choice(["routine", "urgent", "stat"]),
             rand_ts(7),
             rand_ts(5) if status == "completed" else None,
             now_iso()),
        )
        if status == "completed":
            test = random.choice(test_names)
            cur.execute(
                """INSERT INTO lab_results (id, order_id, patient_token, test_name, test_code,
                   result_value, flag, reference_range, unit, reported_at, synced_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (uid(), oid, random.choice(patient_tokens), test[0], test[1],
                 str(round(random.uniform(0.5, 200), 2)),
                 random.choice(["normal", "normal", "normal", "high", "low", "critical"]),
                 "varies", test[2], rand_ts(5), now_iso()),
            )

    # ── Nursing Tasks ────────────────────────────────────────────
    tasks = ["vitals check", "medication administration", "wound dressing",
             "IV fluid change", "catheter care", "patient positioning",
             "blood sugar monitoring", "oxygen therapy check"]
    for aid in admission_ids[:30]:
        for _ in range(random.randint(1, 4)):
            cur.execute(
                """INSERT INTO nursing_tasks (id, admission_id, task, completed, due_at,
                   assigned_to, synced_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (uid(), aid, random.choice(tasks), random.choice([0, 0, 1]),
                 recent_ts(24),
                 f"Nurse {random.choice(first_names)}", now_iso()),
            )

    # ── OT Surgeries ─────────────────────────────────────────────
    surgery_statuses = ["scheduled", "in_progress", "completed", "cancelled", "post_op"]
    for aid in admission_ids[:15]:
        cur.execute(
            """INSERT INTO ot_surgeries (id, admission_id, patient_token, ward, status,
               created_at, synced_at)
               VALUES (?,?,?,?,?,?,?)""",
            (uid(), aid, random.choice(patient_tokens),
             random.choice(["ICU", "General Ward", "Private Ward"]),
             random.choice(surgery_statuses), rand_ts(7), now_iso()),
        )

    # ── Infection Cases ──────────────────────────────────────────
    pathogens = ["MRSA", "C. difficile", "E. coli", "Klebsiella", "Pseudomonas",
                 "Acinetobacter", "VRE", "Candida"]
    for _ in range(12):
        cur.execute(
            """INSERT INTO infection_cases (id, patient_token, admission_id, ward, pathogen,
               severity, isolation_required, isolation_confirmed, isolation_room, status,
               reported_at, notes, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid(), random.choice(patient_tokens),
             random.choice(admission_ids[:40]) if admission_ids else None,
             random.choice(["ICU", "General Ward", "Emergency"]),
             random.choice(pathogens),
             random.choice(["mild", "moderate", "severe"]),
             random.choice([0, 1, 1]),
             random.choice([0, 0, 1]),
             random.choice([None, "ISO-101", "ISO-102", "ISO-103"]),
             random.choice(["active", "active", "resolved", "monitoring"]),
             rand_ts(14), None, now_iso()),
        )

    # ── Supplies ─────────────────────────────────────────────────
    supply_items = [
        ("SUP-001", "Surgical Gloves", "PPE"),
        ("SUP-002", "N95 Masks", "PPE"),
        ("SUP-003", "IV Cannula 18G", "Consumables"),
        ("SUP-004", "Syringes 10ml", "Consumables"),
        ("SUP-005", "Gauze Rolls", "Dressing"),
        ("SUP-006", "Betadine Solution", "Antiseptic"),
        ("SUP-007", "Normal Saline 500ml", "IV Fluids"),
        ("SUP-008", "Oxygen Masks", "Respiratory"),
        ("SUP-009", "Blood Collection Tubes", "Lab"),
        ("SUP-010", "Suture Kit", "Surgical"),
        ("SUP-011", "Catheter Foley 16F", "Consumables"),
        ("SUP-012", "Pulse Oximeter Probes", "Monitoring"),
        ("SUP-013", "ECG Electrodes", "Monitoring"),
        ("SUP-014", "Ventilator Circuits", "Respiratory"),
        ("SUP-015", "Hand Sanitizer 500ml", "PPE"),
    ]
    for code, name, cat in supply_items:
        stock = random.randint(5, 500)
        min_s = random.randint(20, 100)
        cur.execute(
            """INSERT INTO supplies (id, item_code, item_name, category, current_stock,
               min_stock, unit, unit_cost, last_ordered_at, last_received_at, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (uid(), code, name, cat, stock, min_s,
             random.choice(["pieces", "boxes", "bottles", "packs"]),
             round(random.uniform(5, 500), 2), rand_ts(30), rand_ts(20), now_iso()),
        )

    # ── Appointments ─────────────────────────────────────────────
    specializations = ["Cardiology", "Orthopaedics", "Neurology", "General Medicine",
                       "Paediatrics", "Dermatology", "ENT", "Ophthalmology"]
    appt_statuses = ["scheduled", "confirmed", "completed", "cancelled", "no_show"]
    for i in range(50):
        dept = random.choice(list(dept_ids.keys()))
        cur.execute(
            """INSERT INTO appointments (id, patient_id, provider_id, department_id,
               appointment_time, status, type, patient_name, phone, email,
               specialization, department_name, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid(), random.choice(patient_tokens), uid(), dept_ids[dept],
             rand_ts(7), random.choice(appt_statuses),
             random.choice(["consultation", "follow_up", "procedure"]),
             f"{random.choice(first_names)} {random.choice(last_names)}",
             f"+91-{random.randint(7000000000, 9999999999)}",
             None, random.choice(specializations), dept, now_iso()),
        )

    # ── Claims ───────────────────────────────────────────────────
    claim_statuses = ["submitted", "under_review", "approved", "denied", "partially_approved"]
    for i in range(30):
        amount = round(random.uniform(5000, 500000), 2)
        approved = round(amount * random.uniform(0.5, 1.0), 2) if random.random() > 0.3 else 0
        cur.execute(
            """INSERT INTO claims (id, patient_token, visit_id, tpa_name, claim_amount,
               status, created_at, submitted_date, approved_amount, denial_reason,
               claim_number, payer_type, risk_level, risk_score, stage,
               compliance_status, diagnosis_code, branch_id, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid(), random.choice(patient_tokens),
             random.choice(visit_ids) if visit_ids else None,
             random.choice(["Star Health", "ICICI Lombard", "Max Bupa", "HDFC Ergo", "New India"]),
             amount, random.choice(claim_statuses), rand_ts(30), rand_ts(25),
             approved,
             random.choice([None, None, "insufficient documentation", "policy exclusion"]),
             f"CLM-{20000+i}", random.choice(["insurance", "cashless", "reimbursement"]),
             random.choice(["low", "medium", "high"]),
             round(random.uniform(0, 100), 1),
             random.choice(["pre_auth", "claims", "settlement"]),
             random.choice(["compliant", "non_compliant", "pending_review"]),
             random.choice(["J44.1", "I21.0", "K80.2", "S72.0", "O80"]),
             uid(), now_iso()),
        )

    # ── Invoices ─────────────────────────────────────────────────
    for i in range(40):
        subtotal = round(random.uniform(500, 200000), 2)
        gst = round(subtotal * 0.18, 2)
        grand = round(subtotal + gst, 2)
        paid = round(grand * random.uniform(0, 1), 2)
        cur.execute(
            """INSERT INTO invoices (id, org_id, invoice_number, patient_id, invoice_date,
               due_date, invoice_type, subtotal, gst_amount, grand_total, paid_amount,
               balance, status, payment_status, branch_id, created_at, updated_at, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid(), uid(), f"INV-{30000+i}", random.choice(patient_tokens),
             rand_ts(30), rand_ts(15),
             random.choice(["opd", "ipd", "pharmacy", "lab"]),
             subtotal, gst, grand, paid, round(grand - paid, 2),
             random.choice(["Final", "Draft", "Cancelled"]),
             random.choice(["Paid", "Unpaid", "Partial"]),
             uid(), rand_ts(30), now_iso(), now_iso()),
        )

    # ── Daily Collections ────────────────────────────────────────
    for d in range(14):
        dt = (datetime.now(timezone.utc) - timedelta(days=d)).strftime("%Y-%m-%d")
        cash = round(random.uniform(50000, 200000), 2)
        upi = round(random.uniform(100000, 500000), 2)
        card = round(random.uniform(30000, 150000), 2)
        bank = round(random.uniform(20000, 100000), 2)
        total = round(cash + upi + card + bank, 2)
        cur.execute(
            """INSERT INTO daily_collections (id, org_id, collection_date, cash_total, upi_total,
               card_total, bank_transfer_total, total_collection, invoice_count, payment_count,
               is_reconciled, variance, created_at, updated_at, synced_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid(), uid(), dt, cash, upi, card, bank, total,
             random.randint(20, 80), random.randint(15, 60),
             random.choice([0, 1, 1]),
             round(random.uniform(-5000, 5000), 2),
             now_iso(), now_iso(), now_iso()),
        )

    conn.commit()
    conn.close()
    print(f"[OK] Database seeded at {DB_PATH}")

    # Quick summary
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    for (t,) in tables:
        count = cur.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        print(f"  {t}: {count} rows")
    conn.close()

if __name__ == "__main__":
    seed()
