-- ============================================================
-- Hospilot Schema — SQLite-compatible version
-- Adapted from the Postgres schema for the RAG assessment
-- ============================================================

CREATE TABLE IF NOT EXISTS beds (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    ward TEXT,
    bed_number TEXT,
    room_type TEXT,
    status TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT NOT NULL,
    ventilation TEXT,
    room_sharing TEXT,
    proximity INTEGER,
    floor INTEGER,
    wing TEXT,
    natural_light INTEGER,
    noise_level TEXT,
    features TEXT
);

CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    synced_at TEXT NOT NULL,
    capacity INTEGER,
    target_occupancy_pct INTEGER
);

CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    uhid TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS ipd_admissions (
    id TEXT PRIMARY KEY,
    patient_token TEXT,
    bed_id TEXT,
    department_id TEXT,
    admitted_at TEXT,
    expected_discharge_at TEXT,
    status TEXT,
    synced_at TEXT NOT NULL,
    discharge_ready INTEGER,
    discharge_blocked_reason TEXT,
    transfer_pending INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (bed_id) REFERENCES beds(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    patient_token TEXT,
    department_id TEXT,
    arrived_at TEXT,
    status TEXT,
    chief_complaint TEXT,
    synced_at TEXT NOT NULL,
    triage_score INTEGER,
    visit_type TEXT,
    appointment_id TEXT,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS staff_roster (
    id TEXT PRIMARY KEY,
    area TEXT,
    area_label TEXT,
    role TEXT,
    shift TEXT,
    headcount INTEGER DEFAULT 0,
    assigned_load INTEGER DEFAULT 0,
    load_per_staff INTEGER DEFAULT 1,
    branch_id TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS vitals (
    id TEXT PRIMARY KEY,
    patient_token TEXT,
    admission_id TEXT,
    recorded_at TEXT NOT NULL,
    temperature REAL,
    pulse INTEGER,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    spo2 INTEGER,
    respiratory_rate INTEGER,
    gcs INTEGER,
    synced_at TEXT NOT NULL,
    is_critical INTEGER,
    FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

CREATE TABLE IF NOT EXISTS lab_orders (
    id TEXT PRIMARY KEY,
    visit_id TEXT,
    patient_token TEXT,
    ordered_by TEXT,
    status TEXT,
    priority TEXT,
    ordered_at TEXT,
    completed_at TEXT,
    synced_at TEXT,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
);

CREATE TABLE IF NOT EXISTS lab_results (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    patient_token TEXT,
    test_name TEXT,
    test_code TEXT,
    result_value TEXT,
    flag TEXT,
    reference_range TEXT,
    unit TEXT,
    reported_at TEXT,
    synced_at TEXT,
    FOREIGN KEY (order_id) REFERENCES lab_orders(id)
);

CREATE TABLE IF NOT EXISTS nursing_tasks (
    id TEXT PRIMARY KEY,
    admission_id TEXT,
    task TEXT NOT NULL,
    completed INTEGER,
    due_at TEXT,
    assigned_to TEXT,
    synced_at TEXT NOT NULL,
    FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

CREATE TABLE IF NOT EXISTS ot_surgeries (
    id TEXT PRIMARY KEY,
    admission_id TEXT,
    patient_token TEXT,
    ward TEXT,
    status TEXT,
    created_at TEXT,
    synced_at TEXT,
    FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

CREATE TABLE IF NOT EXISTS infection_cases (
    id TEXT PRIMARY KEY,
    patient_token TEXT,
    admission_id TEXT,
    ward TEXT,
    pathogen TEXT,
    severity TEXT,
    isolation_required INTEGER,
    isolation_confirmed INTEGER,
    isolation_room TEXT,
    status TEXT,
    reported_at TEXT,
    notes TEXT,
    synced_at TEXT,
    FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

CREATE TABLE IF NOT EXISTS supplies (
    id TEXT PRIMARY KEY,
    item_code TEXT,
    item_name TEXT,
    category TEXT,
    current_stock REAL,
    min_stock REAL,
    unit TEXT,
    unit_cost REAL,
    last_ordered_at TEXT,
    last_received_at TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    provider_id TEXT,
    department_id TEXT,
    appointment_time TEXT,
    status TEXT,
    type TEXT,
    patient_name TEXT,
    phone TEXT,
    email TEXT,
    specialization TEXT,
    department_name TEXT,
    synced_at TEXT,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS doctor_slots (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    slot_date TEXT,
    slot_start TEXT,
    slot_end TEXT,
    slot_type TEXT,
    status TEXT,
    max_patients INTEGER,
    booked_count INTEGER,
    specialization TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    patient_name TEXT,
    phone TEXT,
    email TEXT,
    specialization TEXT,
    priority TEXT DEFAULT 'medium',
    requested_date TEXT,
    status TEXT DEFAULT 'waitlisted',
    reason TEXT,
    created_at TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS service_slots (
    id TEXT PRIMARY KEY,
    slot_type TEXT,
    slot_date TEXT,
    slot_start TEXT,
    slot_end TEXT,
    location TEXT,
    specialization TEXT,
    max_patients INTEGER DEFAULT 1,
    booked_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    patient_token TEXT,
    visit_id TEXT,
    tpa_id TEXT,
    tpa_name TEXT,
    claim_amount REAL,
    status TEXT,
    created_at TEXT,
    submitted_date TEXT,
    approved_amount REAL,
    denial_reason TEXT,
    claim_number TEXT,
    payer_type TEXT,
    risk_level TEXT,
    risk_score REAL,
    stage TEXT,
    compliance_status TEXT,
    diagnosis_code TEXT,
    branch_id TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    invoice_number TEXT,
    patient_id TEXT,
    invoice_date TEXT,
    due_date TEXT,
    invoice_type TEXT,
    visit_id TEXT,
    admission_id TEXT,
    package_id TEXT,
    insurance_contract_id TEXT,
    subtotal REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    discount_percentage REAL DEFAULT 0,
    gst_amount REAL DEFAULT 0,
    cgst_amount REAL DEFAULT 0,
    sgst_amount REAL DEFAULT 0,
    igst_amount REAL DEFAULT 0,
    grand_total REAL,
    paid_amount REAL DEFAULT 0,
    balance REAL,
    status TEXT DEFAULT 'Draft',
    payment_status TEXT DEFAULT 'Unpaid',
    is_inter_state INTEGER DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    updated_by TEXT,
    cancelled_by TEXT,
    cancelled_at TEXT,
    cancellation_reason TEXT,
    branch_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    receipt_number TEXT,
    invoice_id TEXT,
    patient_id TEXT,
    payment_date TEXT,
    total_amount REAL,
    status TEXT DEFAULT 'Completed',
    received_by TEXT,
    notes TEXT,
    branch_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    synced_at TEXT,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS daily_collections (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    collection_date TEXT NOT NULL,
    cash_total REAL DEFAULT 0,
    upi_total REAL DEFAULT 0,
    card_total REAL DEFAULT 0,
    bank_transfer_total REAL DEFAULT 0,
    cheque_total REAL DEFAULT 0,
    total_collection REAL DEFAULT 0,
    invoice_count INTEGER DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    is_reconciled INTEGER DEFAULT 0,
    reconciled_by TEXT,
    reconciled_at TEXT,
    variance REAL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT,
    vendor_id TEXT,
    status TEXT,
    total REAL,
    order_date TEXT,
    expected_delivery TEXT,
    created_at TEXT,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS discharge_summaries (
    id TEXT PRIMARY KEY,
    admission_id TEXT,
    summary_text TEXT,
    created_at TEXT,
    synced_at TEXT NOT NULL,
    ai_generated_note TEXT,
    FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

-- ============================================================
-- Summary view for quick bed availability queries
-- ============================================================
CREATE VIEW IF NOT EXISTS bed_summary AS
SELECT
    ward,
    COUNT(*) AS total_beds,
    SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_beds,
    SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied_beds,
    SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_beds,
    SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved_beds,
    ROUND(100.0 * SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) / COUNT(*), 1) AS occupancy_pct
FROM beds
WHERE is_active = 1
GROUP BY ward;

-- Staff coverage summary
CREATE VIEW IF NOT EXISTS staff_coverage AS
SELECT
    area,
    area_label,
    role,
    shift,
    headcount,
    assigned_load,
    load_per_staff,
    CASE
        WHEN headcount > 0 THEN ROUND(1.0 * assigned_load / (headcount * load_per_staff) * 100, 1)
        ELSE 0
    END AS utilization_pct,
    CASE
        WHEN headcount * load_per_staff < assigned_load THEN 'understaffed'
        WHEN headcount * load_per_staff > assigned_load * 1.5 THEN 'overstaffed'
        ELSE 'adequate'
    END AS staffing_status
FROM staff_roster;
