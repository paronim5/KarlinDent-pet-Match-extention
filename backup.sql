--
-- PostgreSQL database dump
--

\restrict 6j1oMgEG5zkh4rYsyczvfhkewX12r6NodG4Eb72ne4aEqybpYPWuzDj7fRX3Jrs

-- Dumped from database version 16.12 (Debian 16.12-1.pgdg13+1)
-- Dumped by pg_dump version 16.12 (Debian 16.12-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_doctor_total_revenue(); Type: FUNCTION; Schema: public; Owner: policlinic
--

CREATE FUNCTION public.update_doctor_total_revenue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE staff
    SET total_revenue = total_revenue + NEW.amount,
        updated_at    = NOW()
    WHERE id = NEW.doctor_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_doctor_total_revenue() OWNER TO policlinic;

--
-- Name: update_last_paid_at(); Type: FUNCTION; Schema: public; Owner: policlinic
--

CREATE FUNCTION public.update_last_paid_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE staff
    SET last_paid_at = NEW.payment_date,
        updated_at   = NOW()
    WHERE id = NEW.staff_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_last_paid_at() OWNER TO policlinic;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: income_records; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.income_records (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    doctor_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    lab_cost numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method character varying(10) NOT NULL,
    service_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    service_time time without time zone DEFAULT CURRENT_TIME,
    salary_payment_id integer,
    CONSTRAINT income_records_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'card'::character varying])::text[])))
);


ALTER TABLE public.income_records OWNER TO policlinic;

--
-- Name: avg_patient_payment; Type: VIEW; Schema: public; Owner: policlinic
--

CREATE VIEW public.avg_patient_payment AS
 SELECT round(avg(amount), 2) AS avg_payment
   FROM public.income_records;


ALTER VIEW public.avg_patient_payment OWNER TO policlinic;

--
-- Name: staff; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    role_id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(30),
    email character varying(150),
    bio text,
    base_salary numeric(12,2) DEFAULT 0 NOT NULL,
    commission_rate numeric(5,4) DEFAULT 0 NOT NULL,
    last_paid_at date,
    total_revenue numeric(14,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash character varying(255)
);


ALTER TABLE public.staff OWNER TO policlinic;

--
-- Name: staff_roles; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff_roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL
);


ALTER TABLE public.staff_roles OWNER TO policlinic;

--
-- Name: avg_salary_by_role; Type: VIEW; Schema: public; Owner: policlinic
--

CREATE VIEW public.avg_salary_by_role AS
 SELECT r.name AS role,
    round(avg(s.base_salary), 2) AS avg_salary
   FROM (public.staff s
     JOIN public.staff_roles r ON ((r.id = s.role_id)))
  WHERE (s.is_active = true)
  GROUP BY r.name;


ALTER VIEW public.avg_salary_by_role OWNER TO policlinic;

--
-- Name: clinic_settings; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.clinic_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value numeric(14,2),
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.clinic_settings OWNER TO policlinic;

--
-- Name: clinic_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.clinic_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clinic_settings_id_seq OWNER TO policlinic;

--
-- Name: clinic_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.clinic_settings_id_seq OWNED BY public.clinic_settings.id;


--
-- Name: outcome_records; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.outcome_records (
    id integer NOT NULL,
    category_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor character varying(255),
    expense_time time without time zone DEFAULT CURRENT_TIME
);


ALTER TABLE public.outcome_records OWNER TO policlinic;

--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.salary_payments (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salary_payments OWNER TO policlinic;

--
-- Name: daily_pnl; Type: VIEW; Schema: public; Owner: policlinic
--

CREATE VIEW public.daily_pnl AS
 SELECT (d.d)::date AS day,
    COALESCE(inc.total_income, (0)::numeric) AS total_income,
    (COALESCE("out".total_outcome, (0)::numeric) + COALESCE(sal.total_salaries, (0)::numeric)) AS total_outcome,
    ((COALESCE(inc.total_income, (0)::numeric) - COALESCE("out".total_outcome, (0)::numeric)) - COALESCE(sal.total_salaries, (0)::numeric)) AS pnl
   FROM (((generate_series((( SELECT min(LEAST(sub.service_date, sub.expense_date)) AS min
           FROM ( SELECT min(income_records.service_date) AS service_date,
                    NULL::date AS expense_date
                   FROM public.income_records
                UNION ALL
                 SELECT NULL::date,
                    min(outcome_records.expense_date) AS min
                   FROM public.outcome_records) sub))::timestamp with time zone, (CURRENT_DATE)::timestamp with time zone, '1 day'::interval) d(d)
     LEFT JOIN ( SELECT income_records.service_date AS day,
            sum(income_records.amount) AS total_income
           FROM public.income_records
          GROUP BY income_records.service_date) inc ON ((inc.day = (d.d)::date)))
     LEFT JOIN ( SELECT outcome_records.expense_date AS day,
            sum(outcome_records.amount) AS total_outcome
           FROM public.outcome_records
          GROUP BY outcome_records.expense_date) "out" ON (("out".day = (d.d)::date)))
     LEFT JOIN ( SELECT salary_payments.payment_date AS day,
            sum(salary_payments.amount) AS total_salaries
           FROM public.salary_payments
          GROUP BY salary_payments.payment_date) sal ON ((sal.day = (d.d)::date)));


ALTER VIEW public.daily_pnl OWNER TO policlinic;

--
-- Name: income_records_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.income_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.income_records_id_seq OWNER TO policlinic;

--
-- Name: income_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.income_records_id_seq OWNED BY public.income_records.id;


--
-- Name: medicine_presets; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.medicine_presets (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.medicine_presets OWNER TO policlinic;

--
-- Name: medicine_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.medicine_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.medicine_presets_id_seq OWNER TO policlinic;

--
-- Name: medicine_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.medicine_presets_id_seq OWNED BY public.medicine_presets.id;


--
-- Name: outcome_categories; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.outcome_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);


ALTER TABLE public.outcome_categories OWNER TO policlinic;

--
-- Name: outcome_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.outcome_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outcome_categories_id_seq OWNER TO policlinic;

--
-- Name: outcome_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.outcome_categories_id_seq OWNED BY public.outcome_categories.id;


--
-- Name: outcome_records_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.outcome_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outcome_records_id_seq OWNER TO policlinic;

--
-- Name: outcome_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.outcome_records_id_seq OWNED BY public.outcome_records.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    first_name character varying(100),
    last_name character varying(100) NOT NULL,
    phone character varying(30),
    street_address character varying(255),
    city character varying(50),
    zip_code character varying(10),
    email character varying(150),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.patients OWNER TO policlinic;

--
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patients_id_seq OWNER TO policlinic;

--
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- Name: salary_adjustments; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.salary_adjustments (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text,
    applied_to_salary_payment_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salary_adjustments OWNER TO policlinic;

--
-- Name: salary_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.salary_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_adjustments_id_seq OWNER TO policlinic;

--
-- Name: salary_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.salary_adjustments_id_seq OWNED BY public.salary_adjustments.id;


--
-- Name: salary_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.salary_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_payments_id_seq OWNER TO policlinic;

--
-- Name: salary_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.salary_payments_id_seq OWNED BY public.salary_payments.id;


--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq OWNER TO policlinic;

--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: staff_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_roles_id_seq OWNER TO policlinic;

--
-- Name: staff_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_roles_id_seq OWNED BY public.staff_roles.id;


--
-- Name: staff_timesheets; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff_timesheets (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    work_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    hours numeric(6,2) DEFAULT 0 NOT NULL,
    note text
);


ALTER TABLE public.staff_timesheets OWNER TO policlinic;

--
-- Name: staff_timesheets_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_timesheets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_timesheets_id_seq OWNER TO policlinic;

--
-- Name: staff_timesheets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_timesheets_id_seq OWNED BY public.staff_timesheets.id;


--
-- Name: timesheets_audit; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.timesheets_audit (
    id integer NOT NULL,
    timesheet_id integer,
    staff_id integer NOT NULL,
    action character varying(20) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.timesheets_audit OWNER TO policlinic;

--
-- Name: timesheets_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.timesheets_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.timesheets_audit_id_seq OWNER TO policlinic;

--
-- Name: timesheets_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.timesheets_audit_id_seq OWNED BY public.timesheets_audit.id;


--
-- Name: clinic_settings id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.clinic_settings ALTER COLUMN id SET DEFAULT nextval('public.clinic_settings_id_seq'::regclass);


--
-- Name: income_records id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records ALTER COLUMN id SET DEFAULT nextval('public.income_records_id_seq'::regclass);


--
-- Name: medicine_presets id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.medicine_presets ALTER COLUMN id SET DEFAULT nextval('public.medicine_presets_id_seq'::regclass);


--
-- Name: outcome_categories id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_categories ALTER COLUMN id SET DEFAULT nextval('public.outcome_categories_id_seq'::regclass);


--
-- Name: outcome_records id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_records ALTER COLUMN id SET DEFAULT nextval('public.outcome_records_id_seq'::regclass);


--
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- Name: salary_adjustments id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments ALTER COLUMN id SET DEFAULT nextval('public.salary_adjustments_id_seq'::regclass);


--
-- Name: salary_payments id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_payments ALTER COLUMN id SET DEFAULT nextval('public.salary_payments_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: staff_roles id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_roles ALTER COLUMN id SET DEFAULT nextval('public.staff_roles_id_seq'::regclass);


--
-- Name: staff_timesheets id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_timesheets ALTER COLUMN id SET DEFAULT nextval('public.staff_timesheets_id_seq'::regclass);


--
-- Name: timesheets_audit id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit ALTER COLUMN id SET DEFAULT nextval('public.timesheets_audit_id_seq'::regclass);


--
-- Data for Name: clinic_settings; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.clinic_settings (id, setting_key, setting_value, description, updated_at) FROM stdin;
1	monthly_lease_cost	\N	Monthly rent/lease cost for clinic premises	2026-03-08 13:00:00.079999+00
2	avg_doctor_salary	\N	Average monthly salary for doctors	2026-03-08 13:00:00.079999+00
3	avg_assistant_salary	\N	Average monthly salary for assistants	2026-03-08 13:00:00.079999+00
4	avg_administrator_salary	\N	Average monthly salary for administrators	2026-03-08 13:00:00.079999+00
5	avg_janitor_salary	\N	Average monthly salary for janitors	2026-03-08 13:00:00.079999+00
\.


--
-- Data for Name: income_records; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.income_records (id, patient_id, doctor_id, amount, lab_cost, payment_method, service_date, note, created_at, service_time, salary_payment_id) FROM stdin;
2	1	1	5000.00	0.00	card	2026-03-08	\N	2026-03-08 13:39:24.299511+00	13:39:24.299511	\N
3	4	2	2500.00	0.00	card	2026-03-08	\N	2026-03-08 15:13:28.112376+00	15:13:28.112376	1
4	5	1	1500.00	0.00	card	2026-03-08	\N	2026-03-08 15:15:52.845412+00	15:15:52.845412	\N
5	6	1	2200.00	0.00	cash	2026-03-08	\N	2026-03-08 15:17:17.91913+00	15:17:17.91913	\N
6	7	1	3000.00	0.00	cash	2026-03-08	\N	2026-03-08 15:17:58.113181+00	15:17:58.113181	\N
7	8	4	4000.00	0.00	cash	2026-03-08	\N	2026-03-08 15:18:31.680187+00	15:18:31.680187	\N
8	9	4	3000.00	0.00	card	2026-03-08	\N	2026-03-08 15:19:29.47614+00	15:19:29.47614	\N
9	10	4	500.00	0.00	cash	2026-03-08	\N	2026-03-08 15:19:56.660599+00	15:19:56.660599	\N
10	11	1	1500.00	0.00	cash	2026-03-08	\N	2026-03-08 16:16:02.654468+00	16:16:02.654468	\N
11	12	4	4000.00	0.00	cash	2026-03-08	\N	2026-03-08 16:26:19.321186+00	16:26:19.321186	\N
12	13	1	2000.00	0.00	card	2026-03-08	\N	2026-03-08 17:20:42.087108+00	17:20:42.087108	\N
13	14	4	2200.00	0.00	card	2026-03-08	\N	2026-03-08 17:21:47.739485+00	17:21:47.739485	\N
14	15	4	1200.00	0.00	cash	2026-03-08	\N	2026-03-08 17:22:25.274852+00	17:22:25.274852	\N
15	16	1	2500.00	0.00	card	2026-03-10	\N	2026-03-10 15:55:07.770461+00	15:55:07.770461	\N
16	17	1	3500.00	0.00	card	2026-03-10	\N	2026-03-10 15:55:54.77779+00	15:55:54.77779	\N
17	18	1	700.00	0.00	cash	2026-03-10	\N	2026-03-10 15:56:16.8557+00	15:56:16.8557	\N
18	19	1	1500.00	0.00	card	2026-03-10	\N	2026-03-10 15:56:35.709707+00	15:56:35.709707	\N
21	22	1	2500.00	0.00	card	2026-03-10	\N	2026-03-10 16:07:44.525037+00	16:07:44.525037	\N
22	23	1	500.00	0.00	card	2026-03-10	\N	2026-03-10 16:59:36.764693+00	16:59:36.764693	\N
24	25	1	1500.00	0.00	cash	2026-03-10	\N	2026-03-10 18:30:02.197555+00	18:30:02.197555	\N
25	26	1	3500.00	0.00	cash	2026-03-10	\N	2026-03-10 18:53:13.217792+00	18:53:13.217792	\N
26	27	9	4000.00	0.00	card	2026-03-11	\N	2026-03-11 08:44:22.690577+00	08:44:22.690577	\N
28	29	9	6500.00	0.00	card	2026-03-11	\N	2026-03-11 10:09:51.992418+00	10:09:51.992418	\N
31	30	1	2500.00	0.00	cash	2026-03-11	\N	2026-03-11 13:26:22.380429+00	13:26:22.380429	\N
32	31	4	3000.00	0.00	card	2026-03-11	\N	2026-03-11 14:32:51.910416+00	14:32:51.910416	\N
34	33	4	5000.00	0.00	cash	2026-03-11	\N	2026-03-11 15:42:17.140142+00	15:42:17.140142	\N
35	34	1	3400.00	0.00	cash	2026-03-11	\N	2026-03-11 16:13:10.44234+00	16:13:10.44234	\N
36	35	4	2500.00	0.00	card	2026-03-11	\N	2026-03-11 16:29:40.795165+00	16:29:40.795165	\N
37	36	4	3000.00	0.00	card	2026-03-11	\N	2026-03-11 16:52:07.502546+00	16:52:07.502546	\N
38	14	4	7500.00	0.00	card	2026-03-11	\N	2026-03-11 18:29:04.220737+00	18:29:04.220737	\N
46	44	1	5000.00	0.00	card	2026-03-12	\N	2026-03-12 13:48:05.053734+00	13:48:05.053734	\N
48	46	1	3000.00	0.00	card	2026-03-12	\N	2026-03-12 14:27:48.444071+00	14:27:48.444071	\N
40	38	3	2000.00	0.00	card	2026-03-12	\N	2026-03-12 10:18:02.991721+00	10:18:02.991721	3
42	40	3	9000.00	0.00	cash	2026-03-12	\N	2026-03-12 11:38:48.877406+00	11:38:48.877406	3
43	41	3	20000.00	0.00	card	2026-03-12	\N	2026-03-12 13:14:14.20315+00	13:14:14.20315	3
47	45	3	3500.00	0.00	card	2026-03-12	\N	2026-03-12 14:19:47.041585+00	14:19:47.041585	3
27	28	8	3900.00	0.00	card	2026-03-11	\N	2026-03-11 09:15:37.070987+00	09:15:37.070987	4
29	24	8	3900.00	0.00	card	2026-03-11	\N	2026-03-11 10:42:59.617877+00	10:42:59.617877	4
39	37	8	4200.00	0.00	cash	2026-03-12	\N	2026-03-12 09:57:32.669525+00	09:57:32.669525	4
41	39	8	3500.00	0.00	card	2026-03-12	\N	2026-03-12 10:56:56.406322+00	10:56:56.406322	4
44	42	8	7200.00	0.00	card	2026-03-12	\N	2026-03-12 13:42:14.319029+00	13:42:14.319029	4
19	20	7	3000.00	0.00	cash	2026-03-10	\N	2026-03-10 15:59:11.774802+00	15:59:11.774802	5
20	21	7	8500.00	0.00	card	2026-03-10	\N	2026-03-10 16:02:34.476467+00	16:02:34.476467	5
23	24	7	4000.00	0.00	card	2026-03-10	\N	2026-03-10 17:10:56.841327+00	17:10:56.841327	5
30	24	7	1500.00	0.00	card	2026-03-11	\N	2026-03-11 10:43:11.386816+00	10:43:11.386816	5
33	32	7	6000.00	0.00	cash	2026-03-11	\N	2026-03-11 15:04:33.672786+00	15:04:33.672786	5
45	43	7	2200.00	0.00	card	2026-03-12	\N	2026-03-12 13:44:22.842197+00	13:44:22.842197	5
49	47	7	3500.00	0.00	card	2026-03-12	dh + vektor	2026-03-12 16:04:43.45169+00	16:04:43.45169	5
50	48	7	6500.00	0.00	card	2026-03-12	\N	2026-03-12 18:02:35.51661+00	18:02:35.51661	5
51	49	2	1000.00	0.00	card	2026-03-13	\N	2026-03-13 08:39:09.757824+00	08:39:09.757824	\N
52	50	2	1000.00	0.00	card	2026-03-13	\N	2026-03-13 08:56:01.20617+00	08:56:01.20617	\N
53	51	2	1000.00	0.00	card	2026-03-13	\N	2026-03-13 09:31:09.071871+00	09:31:09.071871	\N
54	51	8	2200.00	0.00	card	2026-03-13	\N	2026-03-13 09:31:22.684606+00	09:31:22.684606	\N
55	52	8	2500.00	0.00	card	2026-03-13	\N	2026-03-13 09:31:40.241488+00	09:31:40.241488	\N
56	53	12	500.00	0.00	cash	2026-03-13	\N	2026-03-13 10:28:46.850426+00	10:28:46.850426	\N
57	54	12	2000.00	0.00	card	2026-03-13	\N	2026-03-13 10:53:27.828911+00	10:53:27.828911	\N
58	55	12	5100.00	0.00	cash	2026-03-13	\N	2026-03-13 12:25:17.626651+00	12:25:17.626651	\N
59	56	8	2200.00	0.00	card	2026-03-13	\N	2026-03-13 13:48:41.853522+00	13:48:41.853522	\N
60	56	12	4500.00	0.00	card	2026-03-13	\N	2026-03-13 13:48:54.436898+00	13:48:54.436898	\N
61	57	1	7000.00	0.00	cash	2026-03-13	\N	2026-03-13 14:11:50.314328+00	14:11:50.314328	\N
62	58	8	4900.00	0.00	card	2026-03-13	\N	2026-03-13 14:14:20.71519+00	14:14:20.71519	\N
63	59	12	5000.00	0.00	card	2026-03-13	\N	2026-03-13 14:40:21.011814+00	14:40:21.011814	\N
64	60	12	3000.00	0.00	card	2026-03-13	\N	2026-03-13 15:25:39.603454+00	15:25:39.603454	\N
65	61	1	14000.00	0.00	cash	2026-03-13	reendo	2026-03-13 15:47:53.015146+00	15:47:53.015146	\N
66	62	1	2500.00	0.00	card	2026-03-13	\N	2026-03-13 16:36:40.550674+00	16:36:40.550674	\N
\.


--
-- Data for Name: medicine_presets; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.medicine_presets (id, name, created_at) FROM stdin;
1	Nimesil	2026-03-10 15:57:21.79143+00
2	Amoksiklav	2026-03-10 15:57:27.924459+00
3	Aulin	2026-03-10 15:57:29.888399+00
4	Augmentin	2026-03-10 15:57:33.223499+00
5	Ciprofloxacin	2026-03-10 15:57:47.926874+00
6	Dalacin C 150	2026-03-10 15:57:57.879891+00
7	Dalacin C 300	2026-03-10 15:58:04.054483+00
\.


--
-- Data for Name: outcome_categories; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.outcome_categories (id, name) FROM stdin;
1	materials
2	rent
3	utilities
4	equipment
5	other
\.


--
-- Data for Name: outcome_records; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.outcome_records (id, category_id, amount, expense_date, description, created_at, vendor, expense_time) FROM stdin;
1	5	1500.00	2026-03-12	 členstni v stomatologicke komore	2026-03-12 14:56:25.752071+00	\N	14:56:25.752071
2	5	480.00	2026-03-12	balik pro karlinDent	2026-03-12 16:52:28.773559+00	\N	16:52:28.773559
3	1	2500.00	2026-03-13	наконечники	2026-03-13 15:13:11.759525+00	\N	15:13:11.759525
4	4	1800.00	2026-03-13	даша заказ temu для клиники	2026-03-13 15:14:05.547132+00	\N	15:14:05.547132
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.patients (id, first_name, last_name, phone, street_address, city, zip_code, email, created_at) FROM stdin;
1	Mykola	Borodach	\N	\N	\N	\N	\N	2026-03-08 13:01:55.734977+00
4	\N	Loginova	\N	\N	\N	\N	\N	2026-03-08 15:13:28.112376+00
5	Roman	Janostak	\N	\N	\N	\N	\N	2026-03-08 15:15:52.845412+00
6	Vladyslav	Golovatyi	\N	\N	\N	\N	\N	2026-03-08 15:17:17.91913+00
7	Yaroslav	Rejpari	\N	\N	\N	\N	\N	2026-03-08 15:17:58.113181+00
8	Yurii	Kornouty	\N	\N	\N	\N	\N	2026-03-08 15:18:31.680187+00
9	Ihor	Romanets	\N	\N	\N	\N	\N	2026-03-08 15:19:29.47614+00
10	Sergey	Polyanskiy	\N	\N	\N	\N	\N	2026-03-08 15:19:56.660599+00
11	Iyad	Khalaila	\N	\N	\N	\N	\N	2026-03-08 16:16:02.654468+00
12	Jana	Kellermannova	\N	\N	\N	\N	\N	2026-03-08 16:26:19.321186+00
13	Min	Liliya	\N	\N	\N	\N	\N	2026-03-08 17:20:42.087108+00
14	Halyna	Smotylevych	\N	\N	\N	\N	\N	2026-03-08 17:21:47.739485+00
15	Palina	Prakapovich	\N	\N	\N	\N	\N	2026-03-08 17:22:25.274852+00
16	Patrik	Tomanek	\N	\N	\N	\N	\N	2026-03-10 15:55:07.770461+00
17	Fedor	Thurzo	\N	\N	\N	\N	\N	2026-03-10 15:55:54.77779+00
18	Yurii	Vitenko	\N	\N	\N	\N	\N	2026-03-10 15:56:16.8557+00
19	Ksenia	Kostyukovskiy	\N	\N	\N	\N	\N	2026-03-10 15:56:35.709707+00
20	Tatiana	Meridzhanova	\N	\N	\N	\N	\N	2026-03-10 15:59:11.774802+00
21	Aleksandra	Manakova	\N	\N	\N	\N	\N	2026-03-10 16:02:34.476467+00
22	Vit	Mraz	\N	\N	\N	\N	\N	2026-03-10 16:07:44.525037+00
23	Mykhailo	Hryhulka	\N	\N	\N	\N	\N	2026-03-10 16:59:36.764693+00
24	Ondrej	Kasal	\N	\N	\N	\N	\N	2026-03-10 17:10:56.841327+00
25	Bohdan	Vasylenko	\N	\N	\N	\N	\N	2026-03-10 18:30:02.197555+00
26	Jan	Javurek	\N	\N	\N	\N	\N	2026-03-10 18:53:13.217792+00
27	Ivan	Sushanyn	\N	\N	\N	\N	\N	2026-03-11 08:44:22.690577+00
28	\N	Pankratova	\N	\N	\N	\N	\N	2026-03-11 09:15:37.070987+00
29	\N	Kopyl	\N	\N	\N	\N	\N	2026-03-11 10:09:51.992418+00
30	\N	Vertikov	\N	\N	\N	\N	\N	2026-03-11 13:26:22.380429+00
31	\N	Hummerova	\N	\N	\N	\N	\N	2026-03-11 14:32:51.910416+00
32	\N	Tylova	\N	\N	\N	\N	\N	2026-03-11 15:04:33.672786+00
33	Ivan	Chepa	\N	\N	\N	\N	\N	2026-03-11 15:42:17.140142+00
34	Ekaterina	Neznakhina	\N	\N	\N	\N	\N	2026-03-11 16:13:10.44234+00
35	Andrii	Dubickyi	\N	\N	\N	\N	\N	2026-03-11 16:29:40.795165+00
36	Marie	Fuksova	\N	\N	\N	\N	\N	2026-03-11 16:52:07.502546+00
37	\N	Beztilna	\N	\N	\N	\N	\N	2026-03-12 09:57:32.669525+00
38	\N	Svedova	\N	\N	\N	\N	\N	2026-03-12 10:18:02.991721+00
39	\N	Burenko	\N	\N	\N	\N	\N	2026-03-12 10:56:56.406322+00
40	\N	Zelenkova	\N	\N	\N	\N	\N	2026-03-12 11:38:48.877406+00
41	\N	Hluscova	\N	\N	\N	\N	\N	2026-03-12 13:14:14.20315+00
42	\N	Jechova	\N	\N	\N	\N	\N	2026-03-12 13:42:14.319029+00
43	\N	Dobrovolska	\N	\N	\N	\N	\N	2026-03-12 13:44:22.842197+00
44	\N	Rusnakova	\N	\N	\N	\N	\N	2026-03-12 13:48:05.053734+00
45	\N	Susienka	\N	\N	\N	\N	\N	2026-03-12 14:19:47.041585+00
46	\N	Zsigmund	\N	\N	\N	\N	\N	2026-03-12 14:27:48.444071+00
47	Anastasia	Sablovskaja	\N	\N	\N	\N	\N	2026-03-12 16:04:43.45169+00
48	Tabriz	Mamedov	\N	\N	\N	\N	\N	2026-03-12 18:02:35.51661+00
49	\N	Popova	\N	\N	\N	\N	\N	2026-03-13 08:39:09.757824+00
50	\N	Smolina	\N	\N	\N	\N	\N	2026-03-13 08:56:01.20617+00
51	\N	Tykhonenko	\N	\N	\N	\N	\N	2026-03-13 09:31:09.071871+00
52	\N	Konstantin	\N	\N	\N	\N	\N	2026-03-13 09:31:40.241488+00
53	\N	Strouf	\N	\N	\N	\N	\N	2026-03-13 10:28:46.850426+00
54	\N	Jani	\N	\N	\N	\N	\N	2026-03-13 10:53:27.828911+00
55	\N	Janko	\N	\N	\N	\N	\N	2026-03-13 12:25:17.626651+00
56	\N	Boychev	\N	\N	\N	\N	\N	2026-03-13 13:48:41.853522+00
57	\N	Louszka	\N	\N	\N	\N	\N	2026-03-13 14:11:50.314328+00
58	\N	Iskusnykh	\N	\N	\N	\N	\N	2026-03-13 14:14:20.71519+00
59	\N	Humbatova	\N	\N	\N	\N	\N	2026-03-13 14:40:21.011814+00
60	Jan	Kaftan	\N	\N	\N	\N	\N	2026-03-13 15:25:39.603454+00
61	Vaclav	Pavlis	\N	\N	\N	\N	\N	2026-03-13 15:47:53.015146+00
62	Marcela	Heislerova	\N	\N	\N	\N	\N	2026-03-13 16:36:40.550674+00
\.


--
-- Data for Name: salary_adjustments; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.salary_adjustments (id, staff_id, amount, reason, applied_to_salary_payment_id, created_at) FROM stdin;
\.


--
-- Data for Name: salary_payments; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.salary_payments (id, staff_id, amount, payment_date, note, created_at) FROM stdin;
1	2	1250.00	2026-03-08		2026-03-08 15:14:23.640021+00
2	5	4400.00	2026-03-08		2026-03-08 17:50:18.219951+00
3	3	12400.00	2026-03-12		2026-03-12 14:46:58.838203+00
4	8	11000.00	2026-03-12	dluh 2000	2026-03-12 14:52:57.621219+00
5	7	10500.00	2026-03-12	должны 60 kc	2026-03-12 18:31:51.222415+00
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff (id, role_id, first_name, last_name, phone, email, bio, base_salary, commission_rate, last_paid_at, total_revenue, is_active, created_at, updated_at, password_hash) FROM stdin;
2	1	Oleh	Safonkin	\N	\N	\N	0.00	0.5000	2026-03-08	3000.00	t	2026-03-08 15:11:47.425673+00	2026-03-13 09:31:09.071871+00	\N
8	1	Khrystyna	Chechina	\N	\N	\N	0.00	0.4000	2026-03-12	11800.00	t	2026-03-11 07:51:37.917996+00	2026-03-13 14:14:20.71519+00	\N
12	1	Ivan	Todorov	\N	\N	\N	0.00	0.4000	\N	20100.00	t	2026-03-11 07:53:23.732446+00	2026-03-13 15:25:39.603454+00	\N
6	2	Masha	.	\N	\N	\N	200.00	0.0000	\N	0.00	t	2026-03-08 16:29:17.822499+00	2026-03-08 17:06:59.566141+00	\N
1	1	Ilja	Potapeiko	\N	\N	\N	0.00	0.3000	\N	73800.00	t	2026-03-08 13:00:39.89444+00	2026-03-13 16:36:40.550674+00	\N
5	3	Pasha	Kosov	\N	\N	\N	200.00	0.0000	2026-03-08	0.00	t	2026-03-08 15:26:40.382639+00	2026-03-08 17:50:18.219951+00	\N
10	1	Samuel	Pasminka	\N	\N	\N	0.00	0.4000	\N	0.00	t	2026-03-11 07:53:00.366398+00	2026-03-11 07:53:00.366398+00	\N
11	1	Alina	Gregorchak	\N	\N	\N	0.00	0.4000	\N	0.00	t	2026-03-11 07:53:13.184836+00	2026-03-11 07:53:13.184836+00	\N
13	2	Maryna	K	\N	\N	\N	200.00	0.0000	\N	0.00	t	2026-03-11 07:55:06.960477+00	2026-03-11 07:55:06.960477+00	\N
14	3	Yaroslav	H	\N	\N	\N	300.00	0.0000	\N	0.00	t	2026-03-11 07:55:31.970184+00	2026-03-11 07:55:31.970184+00	\N
15	3	Daria	P	\N	\N	\N	500.00	0.0000	\N	0.00	t	2026-03-11 07:56:27.47908+00	2026-03-11 07:56:27.47908+00	\N
9	1	Volodymyr	Kochubei	\N	\N	\N	0.00	0.3000	\N	10500.00	t	2026-03-11 07:52:32.600714+00	2026-03-11 10:09:51.992418+00	\N
4	1	Denis	Chechin	\N	\N	\N	0.00	0.4000	\N	35900.00	t	2026-03-08 15:12:44.842397+00	2026-03-11 18:29:04.220737+00	\N
3	1	Ekaterina	Novinenko	\N	\N	\N	0.00	0.4000	2026-03-12	0.00	t	2026-03-08 15:12:20.020301+00	2026-03-12 14:46:58.838203+00	\N
7	1	Viktoriia	N	\N	\N	\N	0.00	0.3000	2026-03-12	0.00	t	2026-03-10 15:57:10.751963+00	2026-03-12 18:31:51.222415+00	\N
\.


--
-- Data for Name: staff_roles; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff_roles (id, name) FROM stdin;
1	doctor
2	assistant
3	administrator
4	janitor
\.


--
-- Data for Name: staff_timesheets; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff_timesheets (id, staff_id, work_date, start_time, end_time, hours, note) FROM stdin;
2	5	2026-02-26	16:00:00	18:00:00	2.00	\N
5	6	2026-03-08	08:10:00	18:30:00	10.33	\N
3	5	2026-02-26	16:00:00	18:00:00	2.00	\N
6	5	2026-02-26	16:00:00	18:00:00	2.00	\N
7	5	2026-02-26	16:00:00	18:00:00	2.00	\N
8	5	2026-03-08	09:00:00	19:00:00	10.00	\N
9	5	2026-03-07	11:00:00	17:00:00	6.00	\N
10	5	2026-03-08	16:00:00	18:00:00	2.00	за 26.02
4	5	2026-03-05	16:00:00	20:00:00	4.00	\N
\.


--
-- Data for Name: timesheets_audit; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.timesheets_audit (id, timesheet_id, staff_id, action, old_data, new_data, changed_by_id, created_at) FROM stdin;
1	1	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 16:20:55.041561+00
2	2	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 16:21:11.508275+00
3	3	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 16:21:35.988144+00
4	4	5	create	\N	{"end_time": "20:00", "staff_id": 5, "work_date": "2026-03-06", "start_time": "16:00"}	5	2026-03-08 16:24:51.466014+00
5	5	6	create	\N	{"end_time": "18:30", "staff_id": 6, "work_date": "2026-03-08", "start_time": "08:10"}	6	2026-03-08 16:29:39.205563+00
6	3	5	update	{"note": "", "hours": 2.0, "end_time": "18:00:00", "work_date": "2026-03-08", "start_time": "16:00:00"}	{"end_time": "18:00", "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 17:46:24.967583+00
7	6	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 17:46:42.203321+00
8	7	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 17:47:11.453038+00
9	8	5	create	\N	{"end_time": "19:00", "staff_id": 5, "work_date": "2026-03-08", "start_time": "09:00"}	5	2026-03-08 17:47:24.742488+00
10	9	5	create	\N	{"end_time": "17:00", "staff_id": 5, "work_date": "2026-03-07", "start_time": "11:00"}	5	2026-03-08 17:48:05.94699+00
11	10	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 17:48:25.734464+00
12	10	5	update	{"note": "", "hours": 2.0, "end_time": "18:00:00", "work_date": "2026-03-08", "start_time": "16:00:00"}	{"note": "за 26.02", "end_time": "18:00", "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 17:48:46.947058+00
13	10	5	update	{"note": "за 26.02", "hours": 2.0, "end_time": "18:00:00", "work_date": "2026-03-08", "start_time": "16:00:00"}	{"note": "за 26.02", "end_time": "18:00", "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 17:48:51.083747+00
14	4	5	update	{"note": "", "hours": 4.0, "end_time": "20:00:00", "work_date": "2026-03-06", "start_time": "16:00:00"}	{"end_time": "20:00", "work_date": "2026-03-05", "start_time": "16:00"}	5	2026-03-08 17:49:27.177934+00
\.


--
-- Name: clinic_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.clinic_settings_id_seq', 5, true);


--
-- Name: income_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.income_records_id_seq', 66, true);


--
-- Name: medicine_presets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.medicine_presets_id_seq', 7, true);


--
-- Name: outcome_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.outcome_categories_id_seq', 5, true);


--
-- Name: outcome_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.outcome_records_id_seq', 4, true);


--
-- Name: patients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.patients_id_seq', 62, true);


--
-- Name: salary_adjustments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.salary_adjustments_id_seq', 1, false);


--
-- Name: salary_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.salary_payments_id_seq', 5, true);


--
-- Name: staff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_id_seq', 15, true);


--
-- Name: staff_roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_roles_id_seq', 7, true);


--
-- Name: staff_timesheets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_timesheets_id_seq', 10, true);


--
-- Name: timesheets_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.timesheets_audit_id_seq', 14, true);


--
-- Name: clinic_settings clinic_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.clinic_settings
    ADD CONSTRAINT clinic_settings_pkey PRIMARY KEY (id);


--
-- Name: clinic_settings clinic_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.clinic_settings
    ADD CONSTRAINT clinic_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: income_records income_records_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_pkey PRIMARY KEY (id);


--
-- Name: medicine_presets medicine_presets_name_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.medicine_presets
    ADD CONSTRAINT medicine_presets_name_key UNIQUE (name);


--
-- Name: medicine_presets medicine_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.medicine_presets
    ADD CONSTRAINT medicine_presets_pkey PRIMARY KEY (id);


--
-- Name: outcome_categories outcome_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_categories
    ADD CONSTRAINT outcome_categories_name_key UNIQUE (name);


--
-- Name: outcome_categories outcome_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_categories
    ADD CONSTRAINT outcome_categories_pkey PRIMARY KEY (id);


--
-- Name: outcome_records outcome_records_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_records
    ADD CONSTRAINT outcome_records_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: salary_adjustments salary_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_pkey PRIMARY KEY (id);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: staff staff_email_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_roles staff_roles_name_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_roles
    ADD CONSTRAINT staff_roles_name_key UNIQUE (name);


--
-- Name: staff_roles staff_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_roles
    ADD CONSTRAINT staff_roles_pkey PRIMARY KEY (id);


--
-- Name: staff_timesheets staff_timesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_timesheets
    ADD CONSTRAINT staff_timesheets_pkey PRIMARY KEY (id);


--
-- Name: timesheets_audit timesheets_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit
    ADD CONSTRAINT timesheets_audit_pkey PRIMARY KEY (id);


--
-- Name: idx_income_doctor; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_income_doctor ON public.income_records USING btree (doctor_id);


--
-- Name: idx_income_salary_payment; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_income_salary_payment ON public.income_records USING btree (salary_payment_id);


--
-- Name: idx_income_service_date; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_income_service_date ON public.income_records USING btree (service_date);


--
-- Name: idx_outcome_expense_date; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_outcome_expense_date ON public.outcome_records USING btree (expense_date);


--
-- Name: idx_patients_last_first_name; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE UNIQUE INDEX idx_patients_last_first_name ON public.patients USING btree (last_name, first_name);


--
-- Name: idx_salary_adjustments_applied; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_adjustments_applied ON public.salary_adjustments USING btree (applied_to_salary_payment_id);


--
-- Name: idx_salary_adjustments_staff; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_adjustments_staff ON public.salary_adjustments USING btree (staff_id);


--
-- Name: idx_salary_payment_date; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_payment_date ON public.salary_payments USING btree (payment_date);


--
-- Name: idx_staff_role; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_staff_role ON public.staff USING btree (role_id);


--
-- Name: income_records trg_income_after_insert; Type: TRIGGER; Schema: public; Owner: policlinic
--

CREATE TRIGGER trg_income_after_insert AFTER INSERT ON public.income_records FOR EACH ROW EXECUTE FUNCTION public.update_doctor_total_revenue();


--
-- Name: salary_payments trg_salary_payment_after_insert; Type: TRIGGER; Schema: public; Owner: policlinic
--

CREATE TRIGGER trg_salary_payment_after_insert AFTER INSERT ON public.salary_payments FOR EACH ROW EXECUTE FUNCTION public.update_last_paid_at();


--
-- Name: income_records income_records_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.staff(id);


--
-- Name: income_records income_records_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: income_records income_records_salary_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_salary_payment_id_fkey FOREIGN KEY (salary_payment_id) REFERENCES public.salary_payments(id) ON DELETE SET NULL;


--
-- Name: outcome_records outcome_records_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_records
    ADD CONSTRAINT outcome_records_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.outcome_categories(id);


--
-- Name: salary_adjustments salary_adjustments_applied_to_salary_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_applied_to_salary_payment_id_fkey FOREIGN KEY (applied_to_salary_payment_id) REFERENCES public.salary_payments(id) ON DELETE SET NULL;


--
-- Name: salary_adjustments salary_adjustments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: salary_payments salary_payments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.staff_roles(id);


--
-- Name: staff_timesheets staff_timesheets_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_timesheets
    ADD CONSTRAINT staff_timesheets_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: timesheets_audit timesheets_audit_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit
    ADD CONSTRAINT timesheets_audit_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES public.staff(id);


--
-- Name: timesheets_audit timesheets_audit_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit
    ADD CONSTRAINT timesheets_audit_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 6j1oMgEG5zkh4rYsyczvfhkewX12r6NodG4Eb72ne4aEqybpYPWuzDj7fRX3Jrs

