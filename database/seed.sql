INSERT INTO departments(name,sort_order) VALUES ('Руководство',0),('Управление цифровизации',1),('Управление государственных услуг',2),('Управление сопровождения ИС',3) ON CONFLICT DO NOTHING;
INSERT INTO users(username,password_hash,full_name,position,department_id,role,email,phone,initials)
SELECT 'k.zhumabayev',crypt('password',gen_salt('bf',12)),'Канат Жумабаев','Директор департамента',id,'director','k.zhumabayev@minagri.gov.kz','+7 7172 55 58 14','КЖ' FROM departments WHERE name='Руководство' ON CONFLICT DO NOTHING;
