-- Script SQL para insertar proyectos y asociar equipos
-- 2 proyectos: uno con 2 equipos asociados y otro con 1 equipo

-- Primero, insertar usuarios (propietarios de los proyectos)
INSERT INTO "Users" (id, name, email, password, "walletAddress", "createdAt", "updatedAt") VALUES
(
    gen_random_uuid(),
    'Admin Proyecto Alpha',
    'admin.alpha@nexuspay.com',
    '$2b$02$XYZ123ABC456DEF789GHI012JKL345MNO678PQR901STU234VWX567YZ', -- password: admin123
    '0xA1B2C3D4E5F6789012345678901234567890ABCD',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    'Manager Proyecto Beta',
    'manager.beta@nexuspay.com',
    '$2b$02$ABC789DEF012GHI345JKL678MNO901PQR234STU567VWX890YZA123BCD', -- password: manager456
    '0xB2C3D4E5F6789012345678901234567890ABCDE1',
    NOW(),
    NOW()
);

-- Insertar proyectos
INSERT INTO "Projects" (id, name, description, income, outcomme, total, "UserId", "createdAt", "updatedAt") 
SELECT 
    gen_random_uuid(),
    'E-Commerce Platform',
    'Plataforma de comercio electrónico completa con sistema de pagos integrado y gestión de inventario',
    250000.00,
    180000.00,
    70000.00,
    u.id,
    NOW(),
    NOW()
FROM "Users" u 
WHERE u.email = 'admin.alpha@nexuspay.com';

INSERT INTO "Projects" (id, name, description, income, outcomme, total, "UserId", "createdAt", "updatedAt") 
SELECT 
    gen_random_uuid(),
    'Mobile Banking App',
    'Aplicación móvil para banca digital con funciones de transferencias, pagos y gestión de cuentas',
    180000.00,
    120000.00,
    60000.00,
    u.id,
    NOW(),
    NOW()
FROM "Users" u 
WHERE u.email = 'manager.beta@nexuspay.com';

-- Asociar equipos a proyectos
-- Proyecto "E-Commerce Platform" -> 2 equipos (Frontend y Backend)
UPDATE "Teams" 
SET "ProjectId" = (
    SELECT id FROM "Projects" WHERE name = 'E-Commerce Platform'
)
WHERE name IN ('Desarrollo Frontend', 'Desarrollo Backend');

-- Proyecto "Mobile Banking App" -> 1 equipo (QA y Testing)
UPDATE "Teams" 
SET "ProjectId" = (
    SELECT id FROM "Projects" WHERE name = 'Mobile Banking App'
)
WHERE name = 'QA y Testing';

-- Verificar los datos insertados
SELECT 
    p.name as project_name,
    p.description,
    p.income,
    p.outcomme,
    p.total,
    u.name as project_owner,
    COUNT(t.id) as total_teams,
    STRING_AGG(t.name, ', ') as team_names
FROM "Projects" p
LEFT JOIN "Users" u ON p."UserId" = u.id
LEFT JOIN "Teams" t ON p.id = t."ProjectId"
WHERE p.name IN ('E-Commerce Platform', 'Mobile Banking App')
GROUP BY p.id, p.name, p.description, p.income, p.outcomme, p.total, u.name
ORDER BY p.name;

-- Ver detalle completo: Proyectos -> Equipos -> Miembros
SELECT 
    p.name as project_name,
    p.income as project_income,
    p.total as project_profit,
    t.name as team_name,
    t.percentage as team_percentage,
    COUNT(m.id) as team_members_count,
    ROUND(AVG(m.salary), 2) as avg_team_salary
FROM "Projects" p
LEFT JOIN "Teams" t ON p.id = t."ProjectId"
LEFT JOIN "Members" m ON t.id = m."TeamId"
WHERE p.name IN ('E-Commerce Platform', 'Mobile Banking App')
GROUP BY p.id, p.name, p.income, p.total, t.id, t.name, t.percentage
ORDER BY p.name, t.name;

-- Resumen de miembros por proyecto
SELECT 
    p.name as project_name,
    m.name as member_name,
    m.email,
    m.salary,
    m.rol,
    t.name as team_name
FROM "Projects" p
JOIN "Teams" t ON p.id = t."ProjectId"
JOIN "Members" m ON t.id = m."TeamId"
WHERE p.name IN ('E-Commerce Platform', 'Mobile Banking App')
ORDER BY p.name, t.name, m.name;
