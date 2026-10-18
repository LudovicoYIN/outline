"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "username", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      WITH candidates AS (
        SELECT
          "id",
          "teamId",
          COALESCE(
            NULLIF(
              TRIM(BOTH '-_.' FROM LEFT(REGEXP_REPLACE(LOWER(SPLIT_PART("email", '@', 1)), '[^a-z0-9._-]+', '-', 'g'), 48)),
              ''
            ),
            'user'
          ) AS candidate
        FROM "users"
      ), ranked AS (
        SELECT
          "id",
          candidate,
          ROW_NUMBER() OVER (PARTITION BY "teamId", candidate ORDER BY "id") AS position
        FROM candidates
      )
      UPDATE "users" AS users
      SET "username" = CASE
        WHEN ranked.position = 1 THEN ranked.candidate
        ELSE LEFT(ranked.candidate, 26) || '-' || users."id"::text
      END
      FROM ranked
      WHERE users."id" = ranked."id"
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "users_team_username_unique"
      ON "users" ("teamId", LOWER("username"))
      WHERE "username" IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "users_team_username_unique"'
    );
    await queryInterface.removeColumn("users", "username");
  },
};
