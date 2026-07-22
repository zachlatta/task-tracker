package main

import (
	"strings"
	"testing"
)

func TestRenderFormulaIncludesEachHomebrewPlatform(t *testing.T) {
	checksums := strings.NewReader(`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  task-tracker_edge-SNAPSHOT-abc1234_darwin_amd64.tar.gz
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  task-tracker_edge-SNAPSHOT-abc1234_darwin_arm64.tar.gz
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  task-tracker_edge-SNAPSHOT-abc1234_linux_amd64.tar.gz
dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd  task-tracker_edge-SNAPSHOT-abc1234_linux_arm64.tar.gz
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee  task-tracker_edge-SNAPSHOT-abc1234_windows_amd64.zip
`)

	formula, err := renderFormula("zachlatta/task-tracker", "0.0.0.42", "edge-SNAPSHOT-abc1234", checksums)
	if err != nil {
		t.Fatalf("renderFormula: %v", err)
	}

	for _, expected := range []string{
		`class TaskTracker < Formula`,
		`version "0.0.0.42"`,
		`url "https://github.com/zachlatta/task-tracker/releases/download/edge/task-tracker_edge-SNAPSHOT-abc1234_darwin_amd64.tar.gz"`,
		`sha256 "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`,
		`url "https://github.com/zachlatta/task-tracker/releases/download/edge/task-tracker_edge-SNAPSHOT-abc1234_darwin_arm64.tar.gz"`,
		`sha256 "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"`,
		`url "https://github.com/zachlatta/task-tracker/releases/download/edge/task-tracker_edge-SNAPSHOT-abc1234_linux_amd64.tar.gz"`,
		`sha256 "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"`,
		`url "https://github.com/zachlatta/task-tracker/releases/download/edge/task-tracker_edge-SNAPSHOT-abc1234_linux_arm64.tar.gz"`,
		`sha256 "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"`,
		`bin.install "task-tracker"`,
		`assert_equal "edge-SNAPSHOT-abc1234\n", shell_output("#{bin}/task-tracker version")`,
	} {
		if !strings.Contains(formula, expected) {
			t.Errorf("formula missing %q:\n%s", expected, formula)
		}
	}
	if strings.Contains(formula, "windows") {
		t.Fatalf("formula unexpectedly includes Windows archive:\n%s", formula)
	}
}

func TestRenderFormulaRequiresEveryHomebrewPlatform(t *testing.T) {
	checksums := strings.NewReader(`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  task-tracker_edge-SNAPSHOT-abc1234_darwin_amd64.tar.gz
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  task-tracker_edge-SNAPSHOT-abc1234_darwin_arm64.tar.gz
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  task-tracker_edge-SNAPSHOT-abc1234_linux_amd64.tar.gz
`)

	_, err := renderFormula("zachlatta/task-tracker", "0.0.0.42", "edge-SNAPSHOT-abc1234", checksums)
	if err == nil || !strings.Contains(err.Error(), "linux_arm64") {
		t.Fatalf("renderFormula error = %v, want missing linux_arm64 archive", err)
	}
}
