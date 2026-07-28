DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum enum_values
    JOIN pg_type enum_types ON enum_types.oid = enum_values.enumtypid
    WHERE enum_types.typname = 'SlipStatus'
      AND enum_values.enumlabel = 'PENDING'
  ) THEN
    ALTER TYPE "SlipStatus" ADD VALUE 'PENDING' AFTER 'ACTIVE';
  END IF;
END $$;
