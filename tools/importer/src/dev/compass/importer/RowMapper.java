package dev.compass.importer;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Turns CSV rows into (date, field, value) entries.
 * The first row is the header. Blank values are skipped (never saved as 0),
 * bad dates and non-numbers are reported, and for a repeated date the last row wins.
 */
public final class RowMapper {
    private RowMapper() {
    }

    /**
     * @param dateCol    column name, or its number counting from 1
     * @param valueCol   column name, or its number counting from 1
     * @param dateFormat a java.time pattern such as "yyyy-MM-dd" or "dd/MM/yyyy"
     */
    public static MapResult map(List<List<String>> rows, String dateCol, String valueCol,
                                String field, String dateFormat) {
        if (rows.isEmpty()) {
            return new MapResult(List.of(), List.of());
        }
        List<String> header = rows.get(0);
        int dateIndex = columnIndex(header, dateCol);
        int valueIndex = columnIndex(header, valueCol);
        // "uuuu" with STRICT rejects dates like 2026-02-30 instead of quietly fixing them.
        DateTimeFormatter format = DateTimeFormatter.ofPattern(dateFormat.replace("yyyy", "uuuu"))
            .withResolverStyle(ResolverStyle.STRICT);

        Map<String, DayValue> byDate = new LinkedHashMap<>();
        List<Skipped> skipped = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            int line = i + 1;
            String rawDate = cell(row, dateIndex);
            String rawValue = cell(row, valueIndex);

            String date;
            try {
                date = LocalDate.parse(rawDate, format).toString();
            } catch (DateTimeParseException e) {
                skipped.add(new Skipped(line, "bad date '" + rawDate + "'"));
                continue;
            }
            if (rawValue.isEmpty()) {
                skipped.add(new Skipped(line, "blank value"));
                continue;
            }
            double value;
            try {
                value = Double.parseDouble(rawValue);
            } catch (NumberFormatException e) {
                skipped.add(new Skipped(line, "not a number '" + rawValue + "'"));
                continue;
            }
            byDate.put(date, new DayValue(date, field, value)); // last row wins
        }
        return new MapResult(new ArrayList<>(byDate.values()), skipped);
    }

    private static int columnIndex(List<String> header, String column) {
        for (int i = 0; i < header.size(); i++) {
            if (header.get(i).trim().equalsIgnoreCase(column.trim())) {
                return i;
            }
        }
        try {
            int number = Integer.parseInt(column.trim());
            if (number >= 1 && number <= header.size()) {
                return number - 1;
            }
        } catch (NumberFormatException ignored) {
            // not a number either; fall through to the error
        }
        throw new IllegalArgumentException("No column called '" + column + "'. The header is: " + header);
    }

    private static String cell(List<String> row, int index) {
        return index < row.size() ? row.get(index).trim() : "";
    }
}
