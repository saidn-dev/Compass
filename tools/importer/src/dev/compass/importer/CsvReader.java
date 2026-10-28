package dev.compass.importer;

import java.util.ArrayList;
import java.util.List;

/**
 * Splits CSV text into rows of cells.
 * Handles a UTF-8 BOM, quoted cells ("a,b"), doubled quotes inside quotes ("say ""hi""")
 * and both CRLF and LF line endings. Blank lines are skipped.
 */
public final class CsvReader {
    private CsvReader() {
    }

    public static List<List<String>> parse(String text) {
        if (text.startsWith("﻿")) {
            text = text.substring(1);
        }

        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inQuotes) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    cell.append('"'); // "" inside quotes is one quote
                    i++;
                } else if (c == '"') {
                    inQuotes = false;
                } else {
                    cell.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++; // CRLF counts as one line break
                }
                row.add(cell.toString());
                cell.setLength(0);
                addUnlessBlank(rows, row);
                row = new ArrayList<>();
            } else {
                cell.append(c);
            }
        }

        // The last line may have no line break after it.
        row.add(cell.toString());
        addUnlessBlank(rows, row);
        return rows;
    }

    private static void addUnlessBlank(List<List<String>> rows, List<String> row) {
        boolean blank = row.size() == 1 && row.get(0).isBlank();
        if (!blank) {
            rows.add(row);
        }
    }
}
