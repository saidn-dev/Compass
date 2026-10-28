package dev.compass.importer;

/** A CSV row that was not imported, and why. row is the line number in the file (1 = header). */
public record Skipped(int row, String reason) {
}
