CREATE INDEX IF NOT EXISTS idx_income_records_doctor_date ON income_records (doctor_id, service_date);
CREATE INDEX IF NOT EXISTS idx_income_records_patient_date ON income_records (patient_id, service_date);
CREATE INDEX IF NOT EXISTS idx_income_records_service_date ON income_records (service_date);
CREATE INDEX IF NOT EXISTS idx_income_records_doctor_time ON income_records (doctor_id, service_time);
