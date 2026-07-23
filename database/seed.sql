INSERT INTO departments(name,sort_order) VALUES ('Руководство',0),('Управление цифровизации',1),('Управление государственных услуг',2),('Управление сопровождения ИС',3) ON CONFLICT DO NOTHING;
