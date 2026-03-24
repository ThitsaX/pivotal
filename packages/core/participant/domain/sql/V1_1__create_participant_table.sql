CREATE TABLE participant (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    jws_public_key TEXT NOT NULL,
    jws_private_key TEXT NOT NULL,
    access_public_key TEXT NOT NULL
);

CREATE UNIQUE INDEX participant_01_uk ON participant (name);
