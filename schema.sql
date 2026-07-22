SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  role ENUM('bidder','admin') NOT NULL DEFAULT 'bidder',
  status ENUM('active','restricted','banned') NOT NULL DEFAULT 'active',
  must_reset_password TINYINT(1) NOT NULL DEFAULT 0,
  private_access ENUM('none','pending','approved','declined') NOT NULL DEFAULT 'none',
  email_verified_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_status (status),
  INDEX idx_users_private_access (private_access)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gemstones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NULL,
  product_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NULL,
  story TEXT NULL,
  weight_carats DECIMAL(10,2) NULL,
  dimensions VARCHAR(100) NULL,
  treatment VARCHAR(100) NULL,
  cut_shape VARCHAR(80) NULL,
  colour VARCHAR(80) NULL,
  origin VARCHAR(120) NULL,
  certification_lab VARCHAR(140) NULL,
  certificate_number VARCHAR(100) NULL,
  primary_image VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gem_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_gem_name (name),
  FULLTEXT INDEX ft_gem_search (name, description, story, colour, origin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gemstone_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gemstone_id BIGINT UNSIGNED NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  alt_text VARCHAR(220) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_image_gem FOREIGN KEY (gemstone_id) REFERENCES gemstones(id) ON DELETE CASCADE,
  INDEX idx_image_gem_sort (gemstone_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auctions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gemstone_id BIGINT UNSIGNED NOT NULL,
  type ENUM('standard','reverse','sealed') NOT NULL DEFAULT 'standard',
  visibility ENUM('public','private','hidden') NOT NULL DEFAULT 'public',
  status ENUM('draft','scheduled','live','ended','cancelled') NOT NULL DEFAULT 'draft',
  starting_price DECIMAL(14,2) NOT NULL,
  current_price DECIMAL(14,2) NOT NULL,
  reserve_price DECIMAL(14,2) NULL,
  buy_now_price DECIMAL(14,2) NULL,
  minimum_increment DECIMAL(14,2) NOT NULL DEFAULT 1.00,
  entry_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  service_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  extension_minutes INT NOT NULL DEFAULT 5,
  extension_window_minutes INT NOT NULL DEFAULT 5,
  highest_bidder_id BIGINT UNSIGNED NULL,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  winner_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_auction_gem FOREIGN KEY (gemstone_id) REFERENCES gemstones(id),
  CONSTRAINT fk_auction_high_bidder FOREIGN KEY (highest_bidder_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_auction_browse (status, visibility, starts_at, ends_at),
  INDEX idx_auction_featured (featured, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bids (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  auction_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  source ENUM('manual','auto') NOT NULL DEFAULT 'manual',
  is_winning TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bid_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  CONSTRAINT fk_bid_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_bid_auction_amount (auction_id, amount),
  INDEX idx_bid_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auto_bids (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  auction_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  maximum_amount DECIMAL(14,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_auto_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  CONSTRAINT fk_auto_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_auto_bid (auction_id, user_id),
  INDEX idx_auto_rank (auction_id, active, maximum_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE watchlists (
  user_id BIGINT UNSIGNED NOT NULL,
  auction_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, auction_id),
  CONSTRAINT fk_watch_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_watch_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE private_access_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  occupation VARCHAR(140) NULL,
  country VARCHAR(100) NULL,
  collection_interest TEXT NULL,
  status ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
  admin_notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_access_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contact_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new','in_progress','closed') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stone_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  gemstone_type VARCHAR(100) NOT NULL,
  weight VARCHAR(80) NULL,
  dimensions VARCHAR(100) NULL,
  treatment VARCHAR(100) NULL,
  shape VARCHAR(80) NULL,
  colour VARCHAR(80) NULL,
  notes TEXT NULL,
  status ENUM('new','sourcing','matched','closed') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_request_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_stone_request_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  auction_id BIGINT UNSIGNED NOT NULL UNIQUE,
  subtotal DECIMAL(14,2) NOT NULL,
  service_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  shipping_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  payment_status ENUM('pending','submitted','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  fulfillment_status ENUM('unfulfilled','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'unfulfilled',
  payment_method VARCHAR(50) NULL,
  payment_reference VARCHAR(120) NULL,
  shipping_name VARCHAR(150) NULL,
  shipping_email VARCHAR(190) NULL,
  shipping_phone VARCHAR(40) NULL,
  shipping_address1 VARCHAR(190) NULL,
  shipping_address2 VARCHAR(190) NULL,
  shipping_city VARCHAR(100) NULL,
  shipping_postal_code VARCHAR(40) NULL,
  shipping_country VARCHAR(100) NULL,
  notes TEXT NULL,
  due_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_order_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  INDEX idx_order_user (user_id, created_at),
  INDEX idx_order_payment (payment_status, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notification_user (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE newsletter_subscribers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id BIGINT UNSIGNED NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO categories (name, slug) VALUES
('Taaffeite', 'taaffeite'), ('Sapphire', 'sapphire'), ('Emerald', 'emerald'),
('Ruby', 'ruby'), ('Alexandrite', 'alexandrite'), ('Spinel', 'spinel');

-- Temporary first login. Change this password immediately from Admin > Security.
-- Email: admin@taaffeiteorigin.com  Password: ChangeMeNow!2026
INSERT INTO users (name, email, password_hash, role, must_reset_password, email_verified_at)
VALUES ('Taaffeite Administrator', 'admin@taaffeiteorigin.com', '$2b$12$AL5pIlQ88KkVya6YiT7/ZOBNBpXmGjcb49qWnB4rwTX7AFFalbxuq', 'admin', 1, UTC_TIMESTAMP());

INSERT INTO gemstones
  (category_id, product_code, name, slug, description, story, weight_carats, dimensions, treatment, cut_shape, colour, origin, certification_lab, primary_image)
VALUES
((SELECT id FROM categories WHERE slug='taaffeite'), 'TO-001', 'The Violet Heirloom', 'violet-heirloom', 'A luminous violet Taaffeite with teal flashes and exceptional clarity.', 'Sourced from the gem-rich lands of Ratnapura, this stone passed through generations of skilled hands while preserving its natural character.', 12.40, '14.2 x 11.8 x 7.1 mm', 'Unheated', 'Oval', 'Violet', 'Ratnapura, Sri Lanka', 'GIA', '/assets/violet-taaffeite.jpg'),
((SELECT id FROM categories WHERE slug='sapphire'), 'TO-002', 'Ceylon Rose Sapphire', 'ceylon-rose-sapphire', 'An intense rose-pink sapphire selected for its even colour and brilliant return.', 'Recovered from alluvial gravel in central Sri Lanka and cut locally to reveal a saturated rose centre.', 4.42, '9.4 x 7.8 x 5.2 mm', 'Heated', 'Oval', 'Pink', 'Elahera, Sri Lanka', 'GIC', '/assets/rose-sapphire.jpg'),
((SELECT id FROM categories WHERE slug='emerald'), 'TO-003', 'Verdant Drop Emerald', 'verdant-drop-emerald', 'A vivid green emerald with a graceful pear silhouette.', 'Chosen for its garden-like inclusions and bold colour, this emerald has a quiet, old-world presence.', 5.16, '12.1 x 8.0 x 5.9 mm', 'Minor oil', 'Pear', 'Green', 'Zambia', 'GIA', '/assets/green-emerald.jpg'),
((SELECT id FROM categories WHERE slug='alexandrite'), 'TO-004', 'Duskfire Alexandrite', 'duskfire-alexandrite', 'A rare colour-change stone shifting from cool teal to raspberry under warm light.', 'A singular stone selected for its dramatic colour change and confident oval cut.', 2.31, '8.1 x 6.2 x 4.4 mm', 'Unheated', 'Oval', 'Teal / Raspberry', 'Sri Lanka', 'GIA', '/assets/violet-taaffeite.jpg'),
((SELECT id FROM categories WHERE slug='spinel'), 'TO-005', 'Ratnapura Flame Spinel', 'ratnapura-flame-spinel', 'A lively fuchsia spinel with crisp facets and open colour.', 'Mined and fashioned in Sri Lanka, preserving a direct line between source and collector.', 3.84, '9.0 x 7.2 x 4.9 mm', 'Unheated', 'Oval', 'Fuchsia', 'Ratnapura, Sri Lanka', 'GIC', '/assets/rose-sapphire.jpg'),
((SELECT id FROM categories WHERE slug='sapphire'), 'TO-006', 'Ocean Glass Sapphire', 'ocean-glass-sapphire', 'A cool blue-green sapphire with a modern mixed cut.', 'Its shifting blue-green face recalls the waters surrounding the island where it was found.', 6.08, '10.2 x 8.7 x 5.8 mm', 'Heated', 'Cushion', 'Teal', 'Sri Lanka', 'GIA', '/assets/green-emerald.jpg');

INSERT INTO auctions
  (gemstone_id, type, visibility, status, starting_price, current_price, reserve_price, buy_now_price, minimum_increment, service_fee_percent, currency, starts_at, ends_at, featured, winner_message)
VALUES
((SELECT id FROM gemstones WHERE product_code='TO-001'), 'standard', 'public', 'live', 9000, 12000, 11000, NULL, 250, 3.5, 'USD', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY), 1, 'This heirloom is now yours. Our concierge will assist with certification and delivery.'),
((SELECT id FROM gemstones WHERE product_code='TO-002'), 'standard', 'public', 'live', 2600, 3100, 2900, 5200, 100, 3.5, 'USD', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 4 DAY), 1, 'Congratulations on acquiring a remarkable Ceylon sapphire.'),
((SELECT id FROM gemstones WHERE product_code='TO-003'), 'reverse', 'public', 'live', 7800, 7200, 6800, NULL, 100, 3.5, 'USD', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), 0, 'Your winning offer has been accepted.'),
((SELECT id FROM gemstones WHERE product_code='TO-004'), 'sealed', 'private', 'live', 14000, 14000, 16000, NULL, 500, 4.0, 'USD', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY), 1, 'A member of our private client team will contact you.'),
((SELECT id FROM gemstones WHERE product_code='TO-005'), 'standard', 'public', 'scheduled', 3400, 3400, 4000, 6800, 100, 3.5, 'USD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 0, 'Congratulations.'),
((SELECT id FROM gemstones WHERE product_code='TO-006'), 'standard', 'private', 'scheduled', 6200, 6200, 7000, NULL, 200, 4.0, 'USD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 6 DAY), 0, 'Welcome to the Taaffeite Origin private collection.');
