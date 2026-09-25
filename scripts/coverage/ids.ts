// @req SCD-VAL-001
/** Requirement id syntax: TYPE-AREA-NNN, e.g. SCD-UI-001. */
export const ID_SOURCE = "[A-Z]+-[A-Z0-9]+-\\d{3}";
export const REQUIREMENT_ID = new RegExp(`^${ID_SOURCE}$`);
