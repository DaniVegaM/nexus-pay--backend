-- Script SQL para insertar datos falsos en PostgreSQL
-- 3 equipos con diferentes cantidades de miembros

-- Insertar equipos
INSERT INTO "Teams" (id, name, description, percentage, "createdAt", "updatedAt") VALUES
(
    gen_random_uuid(),
    'Desarrollo Frontend',
    'Equipo encargado del desarrollo de interfaces de usuario y experiencia del usuario',
    35.5,
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    'Desarrollo Backend',
    'Equipo responsable de la lógica del servidor y APIs',
    45.0,
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    'QA y Testing',
    'Equipo de aseguramiento de calidad y pruebas',
    19.5,
    NOW(),
    NOW()
);

-- Variables para almacenar los IDs de los equipos (usando CTEs)
WITH team_ids AS (
    SELECT 
        id as team_id,
        name,
        ROW_NUMBER() OVER (ORDER BY name) as rn
    FROM "Teams" 
    WHERE name IN ('Desarrollo Frontend', 'Desarrollo Backend', 'QA y Testing')
)

-- Insertar miembros para el equipo de Desarrollo Frontend (5 miembros)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_id,
    NOW(),
    NOW()
FROM team_ids,
(VALUES
    ('Ana García López', 'ana.garcia@nexuspay.com', '0x1234567890abcdef1234567890abcdef12345678', 75000.00, 'Frontend Developer'),
    ('Carlos Rodríguez Martín', 'carlos.rodriguez@nexuspay.com', '0x2345678901bcdef12345678901bcdef123456789', 80000.00, 'Senior Frontend Developer'),
    ('María Fernández Silva', 'maria.fernandez@nexuspay.com', '0x3456789012cdef123456789012cdef1234567890', 70000.00, 'UI/UX Designer'),
    ('Luis Herrera Vega', 'luis.herrera@nexuspay.com', '0x456789013def1234567890123def12345678901a', 85000.00, 'Frontend Team Lead'),
    ('Carmen Jiménez Ruiz', 'carmen.jimenez@nexuspay.com', '0x56789014ef123456789014ef123456789014ef12', 72000.00, 'Frontend Developer')
) AS frontend_members(member_name, member_email, member_wallet, member_salary, member_rol)
WHERE team_ids.rn = 1;

-- Insertar miembros para el equipo de Desarrollo Backend (3 miembros)
WITH team_ids AS (
    SELECT 
        id as team_id,
        name,
        ROW_NUMBER() OVER (ORDER BY name) as rn
    FROM "Teams" 
    WHERE name IN ('Desarrollo Frontend', 'Desarrollo Backend', 'QA y Testing')
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_id,
    NOW(),
    NOW()
FROM team_ids,
(VALUES
    ('Roberto Sánchez Torres', 'roberto.sanchez@nexuspay.com', '0x6789015f1234567890f1234567890f1234567890', 90000.00, 'Senior Backend Developer'),
    ('Elena Morales Castro', 'elena.morales@nexuspay.com', '0x789016f012345678901f012345678901f0123456', 95000.00, 'Backend Team Lead'),
    ('David Ramírez Ortega', 'david.ramirez@nexuspay.com', '0x89017f0123456789012f0123456789012f0123456', 85000.00, 'DevOps Engineer')
) AS backend_members(member_name, member_email, member_wallet, member_salary, member_rol)
WHERE team_ids.rn = 2;

-- Insertar miembros para el equipo de QA y Testing (2 miembros)
WITH team_ids AS (
    SELECT 
        id as team_id,
        name,
        ROW_NUMBER() OVER (ORDER BY name) as rn
    FROM "Teams" 
    WHERE name IN ('Desarrollo Frontend', 'Desarrollo Backend', 'QA y Testing')
)
INSERT INTO "Members" (id, name, email, "walletAddress", salary, rol, "TeamId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    member_name,
    member_email,
    member_wallet,
    member_salary,
    member_rol,
    team_id,
    NOW(),
    NOW()
FROM team_ids,
(VALUES
    ('Patricia Delgado Méndez', 'patricia.delgado@nexuspay.com', '0x9018f012345678901f012345678901f012345678', 70000.00, 'QA Lead'),
    ('Javier Castillo Núñez', 'javier.castillo@nexuspay.com', '0xa019f0123456789012f0123456789012f01234567', 65000.00, 'QA Tester')
) AS qa_members(member_name, member_email, member_wallet, member_salary, member_rol)
WHERE team_ids.rn = 3;

-- Verificar los datos insertados
SELECT 
    t.name as team_name,
    t.description,
    t.percentage,
    COUNT(m.id) as member_count,
    ROUND(AVG(m.salary), 2) as avg_salary
FROM "Teams" t
LEFT JOIN "Members" m ON t.id = m."TeamId"
WHERE t.name IN ('Desarrollo Frontend', 'Desarrollo Backend', 'QA y Testing')
GROUP BY t.id, t.name, t.description, t.percentage
ORDER BY t.name;

-- Ver todos los miembros por equipo
SELECT 
    t.name as team_name,
    m.name as member_name,
    m.email,
    m.salary,
    m.rol
FROM "Teams" t
LEFT JOIN "Members" m ON t.id = m."TeamId"
WHERE t.name IN ('Desarrollo Frontend', 'Desarrollo Backend', 'QA y Testing')
ORDER BY t.name, m.name;
