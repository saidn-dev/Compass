package dev.compass.importer;

/** One number to save: e.g. date "2026-10-20", field "steps", value 8000. */
public record DayValue(String date, String field, Double value) {
}
