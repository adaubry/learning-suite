-- Renfort DB de l'invariant « aucune étude sans rubrique valide » (FUNCTIONS §7, propriétaire S3).
-- CHECK ne peut pas référencer une autre table en Postgres ⇒ trigger.
CREATE FUNCTION "study_cycle_requires_valid_guide"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "correction_guide"
    WHERE "section_id" = NEW."section_id" AND "statut" = 'valide'
  ) THEN
    RAISE EXCEPTION 'section % : aucune rubrique valide, étude interdite', NEW."section_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "study_cycle_requires_valid_guide_trigger"
BEFORE INSERT ON "study_cycle"
FOR EACH ROW EXECUTE FUNCTION "study_cycle_requires_valid_guide"();
