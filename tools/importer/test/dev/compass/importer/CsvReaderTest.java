package dev.compass.importer;

import static dev.compass.importer.TestRunner.add;
import static dev.compass.importer.TestRunner.check;
import static dev.compass.importer.TestRunner.equal;

import java.util.List;

/** Tests for CsvReader, RowMapper and Main's argument and JSON handling (Review Focus 9). */
public class CsvReaderTest {
    static void register() {
        // --- CsvReader ---

        add("BOM at the start is removed", () -> {
            List<List<String>> rows = CsvReader.parse("﻿date,steps\n2026-10-20,8000\n");
            equal("date", rows.get(0).get(0));
        });

        add("a quoted comma stays inside one cell", () -> {
            List<List<String>> rows = CsvReader.parse("\"a,b\",c\n");
            equal(List.of("a,b", "c"), rows.get(0));
        });

        add("a doubled quote inside quotes is one quote", () -> {
            List<List<String>> rows = CsvReader.parse("\"say \"\"hi\"\"\",x\n");
            equal("say \"hi\"", rows.get(0).get(0));
        });

        add("CRLF and LF line endings both work", () -> {
            equal(3, CsvReader.parse("a,b\r\n1,2\r\n3,4").size());
            equal(3, CsvReader.parse("a,b\n1,2\n3,4\n").size());
        });

        add("empty cells are kept as empty strings", () -> {
            equal(List.of("2026-10-20", ""), CsvReader.parse("2026-10-20,\n").get(0));
        });

        add("blank lines are skipped", () -> {
            equal(2, CsvReader.parse("a,b\n\n1,2\n\n").size());
        });

        // --- RowMapper ---

        add("values map to dates by column name", () -> {
            MapResult r = map("date,steps\n2026-10-20,8000\n2026-10-21,9500\n", "date", "steps", "yyyy-MM-dd");
            equal(2, r.values().size());
            equal(new DayValue("2026-10-21", "steps", 9500.0), r.values().get(1));
            equal(0, r.skipped().size());
        });

        add("columns can be given by number (1 = first column)", () -> {
            MapResult r = map("when,count\n2026-10-20,8000\n", "1", "2", "yyyy-MM-dd");
            equal(8000.0, r.values().get(0).value());
        });

        add("a blank value is skipped, never saved as 0", () -> {
            MapResult r = map("date,steps\n2026-10-20,\n2026-10-21,0\n", "date", "steps", "yyyy-MM-dd");
            equal(1, r.values().size());
            equal(0.0, r.values().get(0).value());
            equal(2, r.skipped().get(0).row());
            check(r.skipped().get(0).reason().contains("blank"), r.skipped().get(0).reason());
        });

        add("a bad date is reported in skipped", () -> {
            MapResult r = map("date,steps\n2026-13-45,8000\n", "date", "steps", "yyyy-MM-dd");
            equal(0, r.values().size());
            check(r.skipped().get(0).reason().contains("date"), r.skipped().get(0).reason());
        });

        add("a value that is not a number is reported in skipped", () -> {
            MapResult r = map("date,steps\n2026-10-20,lots\n", "date", "steps", "yyyy-MM-dd");
            equal(0, r.values().size());
            equal(1, r.skipped().size());
        });

        add("other date formats are turned into YYYY-MM-DD", () -> {
            MapResult r = map("date,steps\n20/10/2026,8000\n", "date", "steps", "dd/MM/yyyy");
            equal("2026-10-20", r.values().get(0).date());
        });

        add("duplicate dates: the last row wins", () -> {
            MapResult r = map("date,steps\n2026-10-20,100\n2026-10-20,200\n", "date", "steps", "yyyy-MM-dd");
            equal(1, r.values().size());
            equal(200.0, r.values().get(0).value());
        });

        add("an unknown column name is an error", () -> {
            try {
                map("date,steps\n2026-10-20,1\n", "date", "nope", "yyyy-MM-dd");
                check(false, "expected IllegalArgumentException");
            } catch (IllegalArgumentException expected) {
                check(expected.getMessage().contains("nope"), expected.getMessage());
            }
        });

        // --- Main ---

        add("a --field outside the allowed list is rejected", () -> {
            try {
                Main.parseArgs(new String[] {"--file", "x.csv", "--date-col", "date", "--value-col", "v", "--field", "note"});
                check(false, "expected IllegalArgumentException");
            } catch (IllegalArgumentException expected) {
                check(expected.getMessage().contains("note"), expected.getMessage());
            }
        });

        add("missing required flags are rejected", () -> {
            try {
                Main.parseArgs(new String[] {"--file", "x.csv"});
                check(false, "expected IllegalArgumentException");
            } catch (IllegalArgumentException expected) {
                check(expected.getMessage().contains("--date-col"), expected.getMessage());
            }
        });

        add("defaults: date format and server URL", () -> {
            Main.Options o = Main.parseArgs(new String[] {
                "--file", "x.csv", "--date-col", "date", "--value-col", "v", "--field", "steps"});
            equal("yyyy-MM-dd", o.dateFormat());
            equal("http://127.0.0.1:8765", o.url());
            equal(false, o.dryRun());
        });

        add("the JSON body has whole numbers without .0", () -> {
            String json = Main.toJson(List.of(
                new DayValue("2026-10-20", "steps", 8000.0),
                new DayValue("2026-10-21", "steps", 16.5)));
            equal("{\"days\":[{\"date\":\"2026-10-20\",\"steps\":8000},{\"date\":\"2026-10-21\",\"steps\":16.5}]}", json);
        });
    }

    private static MapResult map(String csv, String dateCol, String valueCol, String format) {
        return RowMapper.map(CsvReader.parse(csv), dateCol, valueCol, "steps", format);
    }
}
