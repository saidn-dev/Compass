package dev.compass.importer;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * Command-line entry point of the CSV importer.
 * Reads a CSV export (e.g. steps or fasting) and sends it to the Compass server (/api/days/bulk).
 * Exit codes: 0 success, 1 server error, 2 bad arguments or unreadable file.
 */
public class Main {
    static final Set<String> FIELDS = Set.of("steps", "fasting_hours", "sleep_hours", "study_hours", "work_hours");

    static final String USAGE = """
        Usage: java -cp tools/importer/out dev.compass.importer.Main
          --file <csv>             the CSV file to import
          --date-col <name|number> the date column (name from the header, or 1 = first column)
          --value-col <name|number> the number column
          --field <name>           one of: steps, fasting_hours, sleep_hours, study_hours, work_hours
          [--date-format yyyy-MM-dd]  how dates look in the file, e.g. dd/MM/yyyy
          [--url http://127.0.0.1:8765]
          [--dry-run]              print what would be sent, send nothing
        """;

    record Options(String file, String dateCol, String valueCol, String field,
                   String dateFormat, String url, boolean dryRun) {
    }

    public static void main(String[] args) {
        Options options;
        try {
            if (args.length == 0 || List.of(args).contains("--help")) {
                System.out.print(USAGE);
                System.exit(args.length == 0 ? 2 : 0);
            }
            options = parseArgs(args);
        } catch (IllegalArgumentException e) {
            System.err.println("Error: " + e.getMessage());
            System.err.print(USAGE);
            System.exit(2);
            return;
        }

        MapResult result;
        try {
            String text = Files.readString(Path.of(options.file()), StandardCharsets.UTF_8);
            result = RowMapper.map(CsvReader.parse(text), options.dateCol(), options.valueCol(),
                options.field(), options.dateFormat());
        } catch (IOException e) {
            System.err.println("Error: cannot read " + options.file() + ": " + e.getMessage());
            System.exit(2);
            return;
        } catch (IllegalArgumentException e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(2);
            return;
        }

        for (Skipped s : result.skipped()) {
            System.out.println("Skipped line " + s.row() + ": " + s.reason());
        }
        String body = toJson(result.values());

        if (options.dryRun()) {
            System.out.println("Dry run, nothing sent. Would send " + result.values().size() + " value(s):");
            System.out.println(body);
            return;
        }
        if (result.values().isEmpty()) {
            System.out.println("Nothing to send.");
            return;
        }
        System.exit(send(options.url(), body));
    }

    /** Reads the flags. Throws IllegalArgumentException with a readable message when something is wrong. */
    static Options parseArgs(String[] args) {
        String file = null;
        String dateCol = null;
        String valueCol = null;
        String field = null;
        String dateFormat = "yyyy-MM-dd";
        String url = "http://127.0.0.1:8765";
        boolean dryRun = false;

        for (int i = 0; i < args.length; i++) {
            String flag = args[i];
            if (flag.equals("--dry-run")) {
                dryRun = true;
                continue;
            }
            if (i + 1 >= args.length) {
                throw new IllegalArgumentException(flag + " needs a value");
            }
            String value = args[++i];
            switch (flag) {
                case "--file" -> file = value;
                case "--date-col" -> dateCol = value;
                case "--value-col" -> valueCol = value;
                case "--field" -> field = value;
                case "--date-format" -> dateFormat = value;
                case "--url" -> url = value.replaceAll("/+$", "");
                default -> throw new IllegalArgumentException("unknown flag " + flag);
            }
        }

        if (file == null) {
            throw new IllegalArgumentException("--file is required");
        }
        if (dateCol == null) {
            throw new IllegalArgumentException("--date-col is required");
        }
        if (valueCol == null) {
            throw new IllegalArgumentException("--value-col is required");
        }
        if (field == null) {
            throw new IllegalArgumentException("--field is required");
        }
        if (!FIELDS.contains(field)) {
            throw new IllegalArgumentException("--field must be one of " + FIELDS + ", not '" + field + "'");
        }
        return new Options(file, dateCol, valueCol, field, dateFormat, url, dryRun);
    }

    /**
     * Builds {"days":[{"date":"2026-10-20","steps":8000}, ...]} by hand.
     * Safe without escaping: dates are checked YYYY-MM-DD and fields come from FIELDS.
     */
    static String toJson(List<DayValue> values) {
        StringBuilder json = new StringBuilder("{\"days\":[");
        for (int i = 0; i < values.size(); i++) {
            DayValue v = values.get(i);
            if (i > 0) {
                json.append(',');
            }
            json.append("{\"date\":\"").append(v.date()).append("\",\"")
                .append(v.field()).append("\":").append(number(v.value())).append('}');
        }
        return json.append("]}").toString();
    }

    /** 8000.0 -> "8000", 16.5 -> "16.5" */
    private static String number(double value) {
        return value == Math.rint(value) && Math.abs(value) < 1e15
            ? Long.toString((long) value)
            : Double.toString(value);
    }

    /** POSTs the body and prints the server's answer. Returns the exit code. */
    private static int send(String url, String body) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url + "/api/days/bulk"))
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        try {
            HttpResponse<String> response = HttpClient.newHttpClient()
                .send(request, HttpResponse.BodyHandlers.ofString());
            System.out.println("Server answered " + response.statusCode() + ": " + response.body());
            return response.statusCode() / 100 == 2 ? 0 : 1;
        } catch (IOException e) {
            String reason = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            System.err.println("Error: cannot reach " + url + " (is Compass running?): " + reason);
            return 1;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return 1;
        }
    }
}
