-- Script SQL para crear 2 proyectos con equipos y miembros
-- Proyecto 1: 4 equipos | Proyecto 2: 2 equipos
-- Respetando restricciones de salarios vs presupuesto de equipos

-- ===================================
-- 1. CREAR USUARIOS PROPIETARIOS
-- ===================================
INSERT INTO "Users" (id, name, email, password, "walletAddress", "createdAt", "updatedAt") VALUES
(
    gen_random_uuid(),
    'CEO Tech Solutions',
    'ceo@techsolutions.com',
    '$2b$02$XYZ123ABC456DEF789GHI012JKL345MNO678PQR901STU234VWX567YZ',
    '0xCEO1234567890ABCDEF1234567890ABCDEF123456',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    'CTO Innovation Lab',
    'cto@innovationlab.com',
    '$2b$02$ABC789DEF012GHI345JKL678MNO901PQR234STU567VWX890YZA123BCD',
    '0xCTO7890ABCDEF1234567890ABCDEF1234567890AB',
    NOW(),
    NOW()
);

-- ===================================
-- 2. CREAR PROYECTOS
-- ===================================

-- PROYECTO 1: E-Learning Platform (4 equipos)
INSERT INTO "Projects" (id, name, description, income, outcomme, total, "UserId", "createdAt", "updatedAt") 
SELECT 
    gen_random_uuid(),
    'E-Learning Platform',
    'Plataforma educativa online con sistema de cursos, evaluaciones y certificaciones',
    500000.00,    -- Ingresos
    350000.00,    -- Gastos
    150000.00,    -- Ganancia total para distribuir
    u.id,
    NOW(),
    NOW()
FROM "Users" u 
WHERE u.email = 'ceo@techsolutions.com';

-- PROYECTO 2: FinTech Mobile App (2 equipos)
INSERT INTO "Projects" (id, name, description, income, outcomme, total, "UserId", "createdAt", "updatedAt") 
SELECT 
    gen_random_uuid(),
    'FinTech Mobile App',
    'Aplicación móvil para gestión financiera personal con IA y análisis predictivo',
    300000.00,    -- Ingresos
    200000.00,    -- Gastos
    100000.00,    -- Ganancia total para distribuir
    u.id,
    NOW(),
    NOW()
FROM "Users" u 
WHERE u.email = 'cto@innovationlab.com';

-- ===================================
-- 3. CREAR EQUIPOS CON PORCENTAJES QUE SUMEN 100%
-- ===================================

-- EQUIPOS PARA E-Learning Platform (4 equipos = 100%)
WITH project_elearning AS (
    SELECT id FROM "Projects" WHERE name = 'E-Learning Platform'
)
INSERT INTO "Teams" (id, name, description, percentage, "ProjectId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    team_name,
    team_description,
    team_percentage,
    project_elearning.id,
    NOW(),
    NOW()
FROM project_elearning,
(VALUES
    ('Frontend Development', 'Desarrollo de interfaces web responsivas y UX/UI', 30.0),
    ('Backend & DevOps', 'APIs, base de datos y infraestructura cloud', 35.0),
    ('Mobile Development', 'Aplicaciones nativas iOS y Android', 25.0),
    ('QA & Security', 'Testing, seguridad y control de calidad', 10.0)
) AS teams_data(team_name, team_description, team_percentage);

-- EQUIPOS PARA FinTech Mobile App (2 equipos = 100%)
WITH project_fintech AS (
    SELECT id FROM "Projects" WHERE name = 'FinTech Mobile App'
)
INSERT INTO "Teams" (id, name, description, percentage, "ProjectId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    team_name,
    team_description,
    team_percentage,
    project_fintech.id,
    NOW(),
    NOW()
FROM project_fintech,
(VALUES
    ('Full-Stack Development', 'Desarrollo completo frontend y backend', 70.0),
    ('AI & Data Science', 'Machine Learning y análisis de datos', 30.0)
) AS teams_data(team_name, team_description, team_percentage);

-- ===================================
-- 4. CREAR MIEMBROS CON SALARIOS CONTROLADOS
-- ===================================

-- Función auxiliar para calcular presupuesto por equipo:
-- Presupuesto_Equipo = (Porcentaje_Equipo / 100) * Total_Proyecto

-- MIEMBROS PARA FRONTEND DEVELOPMENT (30% de $150,000 = $45,000)
-- 5 miembros con salarios que no excedan $45,000 total
WITH team_frontend AS (
    SELECT t.id as team_id 
    FROM "Teams" t 
    JOIN "Projects" p ON t."ProjectId" = p.id 
    WHERE t.name = 'Frontend Development' AND p.name = 'E-Learning Platform'
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_frontend.team_id,
    NOW(),
    NOW()
FROM team_frontend,
(VALUES
    ('Isabella Rodriguez', 'isabella.rodriguez@techsol.com', '0xFE001234567890ABCDEF1234567890ABCDEF1234', 12000.00, 'Frontend Lead'),
    ('Marcus Chen', 'marcus.chen@techsol.com', '0xFE002345678901BCDEF12345678901BCDEF12345', 10000.00, 'React Developer'),
    ('Sofia Kumar', 'sofia.kumar@techsol.com', '0xFE003456789012CDEF123456789012CDEF123456', 9000.00, 'UI/UX Designer'),
    ('Diego Martinez', 'diego.martinez@techsol.com', '0xFE004567890123DEF1234567890123DEF1234567', 8000.00, 'Frontend Developer'),
    ('Aria Thompson', 'aria.thompson@techsol.com', '0xFE005678901234EF12345678901234EF12345678', 6000.00, 'Junior Developer')
) AS frontend_members(member_name, member_email, member_wallet, member_salary, member_rol);
-- Total salarios Frontend: $45,000 (exacto)

-- MIEMBROS PARA BACKEND & DEVOPS (35% de $150,000 = $52,500)
-- 4 miembros con salarios que no excedan $52,500 total
WITH team_backend AS (
    SELECT t.id as team_id 
    FROM "Teams" t 
    JOIN "Projects" p ON t."ProjectId" = p.id 
    WHERE t.name = 'Backend & DevOps' AND p.name = 'E-Learning Platform'
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_backend.team_id,
    NOW(),
    NOW()
FROM team_backend,
(VALUES
    ('Alexander Johnson', 'alex.johnson@techsol.com', '0xBE001234567890ABCDEF1234567890ABCDEF1234', 18000.00, 'Backend Lead'),
    ('Natasha Volkov', 'natasha.volkov@techsol.com', '0xBE002345678901BCDEF12345678901BCDEF12345', 15000.00, 'DevOps Engineer'),
    ('Ryan O''Connor', 'ryan.oconnor@techsol.com', '0xBE003456789012CDEF123456789012CDEF123456', 12000.00, 'API Developer'),
    ('Zara Ahmed', 'zara.ahmed@techsol.com', '0xBE004567890123DEF1234567890123DEF1234567', 7500.00, 'Database Specialist')
) AS backend_members(member_name, member_email, member_wallet, member_salary, member_rol);
-- Total salarios Backend: $52,500 (exacto)

-- MIEMBROS PARA MOBILE DEVELOPMENT (25% de $150,000 = $37,500)
-- 3 miembros con salarios que no excedan $37,500 total
WITH team_mobile AS (
    SELECT t.id as team_id 
    FROM "Teams" t 
    JOIN "Projects" p ON t."ProjectId" = p.id 
    WHERE t.name = 'Mobile Development' AND p.name = 'E-Learning Platform'
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_mobile.team_id,
    NOW(),
    NOW()
FROM team_mobile,
(VALUES
    ('Liam Zhang', 'liam.zhang@techsol.com', '0xMO001234567890ABCDEF1234567890ABCDEF1234', 16000.00, 'Mobile Lead'),
    ('Emma Gonzalez', 'emma.gonzalez@techsol.com', '0xMO002345678901BCDEF12345678901BCDEF12345', 12000.00, 'iOS Developer'),
    ('Noah Williams', 'noah.williams@techsol.com', '0xMO003456789012CDEF123456789012CDEF123456', 9500.00, 'Android Developer')
) AS mobile_members(member_name, member_email, member_wallet, member_salary, member_rol);
-- Total salarios Mobile: $37,500 (exacto)

-- MIEMBROS PARA QA & SECURITY (10% de $150,000 = $15,000)
-- 2 miembros con salarios que no excedan $15,000 total
WITH team_qa AS (
    SELECT t.id as team_id 
    FROM "Teams" t 
    JOIN "Projects" p ON t."ProjectId" = p.id 
    WHERE t.name = 'QA & Security' AND p.name = 'E-Learning Platform'
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_qa.team_id,
    NOW(),
    NOW()
FROM team_qa,
(VALUES
    ('Olivia Brown', 'olivia.brown@techsol.com', '0xQA001234567890ABCDEF1234567890ABCDEF1234', 9000.00, 'QA Lead'),
    ('Ethan Davis', 'ethan.davis@techsol.com', '0xQA002345678901BCDEF12345678901BCDEF12345', 6000.00, 'Security Tester')
) AS qa_members(member_name, member_email, member_wallet, member_salary, member_rol);
-- Total salarios QA: $15,000 (exacto)

-- ===================================
-- MIEMBROS PARA PROYECTO FINTECH
-- ===================================

-- MIEMBROS PARA FULL-STACK DEVELOPMENT (70% de $100,000 = $70,000)
-- 6 miembros con salarios que no excedan $70,000 total
WITH team_fullstack AS (
    SELECT t.id as team_id 
    FROM "Teams" t 
    JOIN "Projects" p ON t."ProjectId" = p.id 
    WHERE t.name = 'Full-Stack Development' AND p.name = 'FinTech Mobile App'
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_fullstack.team_id,
    NOW(),
    NOW()
FROM team_fullstack,
(VALUES
    ('Maya Patel', 'maya.patel@innovlab.com', '0xFS001234567890ABCDEF1234567890ABCDEF1234', 16000.00, 'Full-Stack Lead'),
    ('Jake Morrison', 'jake.morrison@innovlab.com', '0xFS002345678901BCDEF12345678901BCDEF12345', 14000.00, 'Senior Full-Stack'),
    ('Luna Rivera', 'luna.rivera@innovlab.com', '0xFS003456789012CDEF123456789012CDEF123456', 12000.00, 'Frontend Specialist'),
    ('Owen Kim', 'owen.kim@innovlab.com', '0xFS004567890123DEF1234567890123DEF1234567', 11000.00, 'Backend Specialist'),
    ('Chloe Anderson', 'chloe.anderson@innovlab.com', '0xFS005678901234EF12345678901234EF12345678', 9000.00, 'Mobile Developer'),
    ('Kai Nguyen', 'kai.nguyen@innovlab.com', '0xFS006789012345F123456789012345F123456789', 8000.00, 'Junior Developer')
) AS fullstack_members(member_name, member_email, member_wallet, member_salary, member_rol);
-- Total salarios Full-Stack: $70,000 (exacto)

-- MIEMBROS PARA AI & DATA SCIENCE (30% de $100,000 = $30,000)
-- 3 miembros con salarios que no excedan $30,000 total
WITH team_ai AS (
    SELECT t.id as team_id 
    FROM "Teams" t 
    JOIN "Projects" p ON t."ProjectId" = p.id 
    WHERE t.name = 'AI & Data Science' AND p.name = 'FinTech Mobile App'
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_ai.team_id,
    NOW(),
    NOW()
FROM team_ai,
(VALUES
    ('Dr. Amara Singh', 'amara.singh@innovlab.com', '0xAI001234567890ABCDEF1234567890ABCDEF1234', 15000.00, 'AI Lead / Data Scientist'),
    ('Felix Carter', 'felix.carter@innovlab.com', '0xAI002345678901BCDEF12345678901BCDEF12345', 10000.00, 'ML Engineer'),
    ('Iris Lee', 'iris.lee@innovlab.com', '0xAI003456789012CDEF123456789012CDEF123456', 5000.00, 'Data Analyst')
) AS ai_members(member_name, member_email, member_wallet, member_salary, member_rol);
-- Total salarios AI: $30,000 (exacto)

-- ===================================
-- 5. CONSULTAS DE VERIFICACIÓN
-- ===================================

-- Verificar restricciones financieras
SELECT 
    p.name as proyecto,
    p.total as ganancia_total,
    t.name as equipo,
    t.percentage as porcentaje,
    ROUND((t.percentage / 100.0) * p.total, 2) as presupuesto_equipo,
    COUNT(m.id) as num_miembros,  
    COALESCE(SUM(m.salary), 0) as salarios_totales,
    ROUND((t.percentage / 100.0) * p.total, 2) - COALESCE(SUM(m.salary), 0) as diferencia,
    CASE 
        WHEN COALESCE(SUM(m.salary), 0) <= ROUND((t.percentage / 100.0) * p.total, 2) 
        THEN '✅ CORRECTO' 
        ELSE '❌ EXCEDE PRESUPUESTO' 
    END as estado_presupuesto
FROM "Projects" p
JOIN "Teams" t ON p.id = t."ProjectId"
LEFT JOIN "Members" m ON t.id = m."TeamId"
WHERE p.name IN ('E-Learning Platform', 'FinTech Mobile App')
GROUP BY p.id, p.name, p.total, t.id, t.name, t.percentage
ORDER BY p.name, t.name;

-- Resumen por proyecto
SELECT 
    p.name as proyecto,
    p.total as ganancia_total,
    COUNT(DISTINCT t.id) as total_equipos,
    COUNT(DISTINCT m.id) as total_miembros,
    SUM(t.percentage) as suma_porcentajes,
    COALESCE(SUM(m.salary), 0) as suma_salarios,
    p.total - COALESCE(SUM(m.salary), 0) as ganancia_restante,
    CASE 
        WHEN SUM(t.percentage) = 100 THEN '✅ PORCENTAJES OK' 
        ELSE '❌ PORCENTAJES INCORRECTOS' 
    END as estado_porcentajes
FROM "Projects" p
LEFT JOIN "Teams" t ON p.id = t."ProjectId"
LEFT JOIN "Members" m ON t.id = m."TeamId"
WHERE p.name IN ('E-Learning Platform', 'FinTech Mobile App')
GROUP BY p.id, p.name, p.total
ORDER BY p.name;

-- Detalle completo de miembros por proyecto y equipo
SELECT 
    p.name as proyecto,
    t.name as equipo,
    m.name as miembro,
    m.salary as salario,
    m.rol
FROM "Projects" p
JOIN "Teams" t ON p.id = t."ProjectId"
JOIN "Members" m ON t.id = m."TeamId"
WHERE p.name IN ('E-Learning Platform', 'FinTech Mobile App')
ORDER BY p.name, t.name, m.salary DESC;
