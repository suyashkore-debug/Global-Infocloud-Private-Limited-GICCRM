-- ProjectsApp MySQL setup. Run once as MySQL root on the HRMS MySQL server (gicsupportcrm_db).
-- Replace CHANGE_ME with a strong password and put the same value in ProjectsApp .env
-- (DB_PASSWORD and HRMS_DB_PASSWORD).
--
--   docker exec -i gicsupportcrm_db mysql -uroot -p < database/setup/mysql-setup.sql

-- ProjectsApp's own data (projects, tasks, ...) and its test database.
CREATE DATABASE IF NOT EXISTS projectsapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS projectsapp_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'projectsapp'@'%' IDENTIFIED BY 'CHANGE_ME';
GRANT ALL PRIVILEGES ON projectsapp.* TO 'projectsapp'@'%';
GRANT ALL PRIVILEGES ON projectsapp_test.* TO 'projectsapp'@'%';

-- HRMS database: read only, and only the tables login needs.
GRANT SELECT ON gicsupportcrm.users TO 'projectsapp'@'%';
GRANT SELECT ON gicsupportcrm.companies TO 'projectsapp'@'%';
GRANT SELECT ON gicsupportcrm.roles TO 'projectsapp'@'%';
GRANT SELECT ON gicsupportcrm.user_roles TO 'projectsapp'@'%';
-- Sanctum stamps last_used_at on every request.
GRANT SELECT, UPDATE (last_used_at, updated_at) ON gicsupportcrm.personal_access_tokens TO 'projectsapp'@'%';

FLUSH PRIVILEGES;
