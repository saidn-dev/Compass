package dev.compass.importer;

import java.util.ArrayList;
import java.util.List;

/**
 * A tiny stand-in for JUnit: runs every test, prints PASS/FAIL per test,
 * and exits with code 1 if anything failed.
 */
public class TestRunner {
    /** One test: a name and code that throws AssertionError when it fails. */
    interface Test {
        void run() throws Exception;
    }

    private static final List<String> names = new ArrayList<>();
    private static final List<Test> tests = new ArrayList<>();

    static void add(String name, Test test) {
        names.add(name);
        tests.add(test);
    }

    static void check(boolean ok, String message) {
        if (!ok) {
            throw new AssertionError(message);
        }
    }

    static void equal(Object expected, Object actual) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError("expected <" + expected + "> but got <" + actual + ">");
        }
    }

    public static void main(String[] args) {
        CsvReaderTest.register();
        int failed = 0;
        for (int i = 0; i < tests.size(); i++) {
            try {
                tests.get(i).run();
                System.out.println("PASS  " + names.get(i));
            } catch (Throwable t) {
                failed++;
                System.out.println("FAIL  " + names.get(i) + "  -> " + t);
            }
        }
        System.out.println();
        System.out.println((tests.size() - failed) + " passed, " + failed + " failed");
        System.exit(failed == 0 ? 0 : 1);
    }
}
