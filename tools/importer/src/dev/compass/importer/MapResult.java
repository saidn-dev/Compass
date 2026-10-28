package dev.compass.importer;

import java.util.List;

/** What RowMapper found: the values to send, and the rows it had to skip. */
public record MapResult(List<DayValue> values, List<Skipped> skipped) {
}
