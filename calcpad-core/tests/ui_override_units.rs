//! An entered value that carries a unit (`5000 mm`, `8000 N/m`) is converted to the unit the input declares, and a unit of another
//! dimension is refused on the line (docs/embedding.md, the host's values; the MCP `inputs`). A bare number is applied as before.
use std::collections::HashMap;

use calcpad_core::parsers::expression_parser::ExpressionParser;

fn render(source: &str, enable_ui: bool, name: &str, value: &str) -> String {
    let mut parser = ExpressionParser::new();
    parser.enable_ui = enable_ui;
    parser.ui_overrides = Some(HashMap::from([(name.to_string(), value.to_string())]));
    parser.show_error_lines = !enable_ui;
    parser.parse(source, true);
    parser.html_result.clone()
}

fn text(html: &str) -> String {
    let (mut out, mut tag) = (String::new(), false);
    for c in html.chars() {
        match c {
            '<' => tag = true,
            '>' => {
                tag = false;
                out.push(' ');
            }
            _ if !tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
fn a_length_in_millimetres_is_converted_to_the_declared_metres() {
    for enable_ui in [false, true] {
        let t = text(&render("#UI L = 6m\nA = L*2", enable_ui, "L", "5000 mm"));
        // In the form the control shows the entry, in the report the line reads as a conversion.
        assert!(enable_ui || t.contains("L = 5000 mm = 5 m"), "ui={enable_ui}: {t}");
        assert!(t.contains("A = L · 2 = 5 m · 2 = 10 m"), "ui={enable_ui}: {t}");
        assert!(!t.contains("Error"), "ui={enable_ui}: {t}");
    }
    let t = text(&render("#UI L = 6m\nA = L*2", false, "L", "5000mm"));
    assert!(t.contains("= 5 m"), "{t}");
}

#[test]
fn a_force_per_length_in_newtons_per_metre_becomes_kilonewtons_per_metre() {
    let t = text(&render("#UI q = 10kN/m\nA = q*2", false, "q", "8000 N/m"));
    assert!(t.contains("8 kN ∕ m") && t.contains("A = q · 2 = 8 kN ∕ m · 2 = 16 kN ∕ m"), "{t}");
    assert!(!t.contains("Error"), "{t}");
}

#[test]
fn a_unit_of_another_dimension_is_refused_on_the_line_and_says_what_was_given_and_expected() {
    for enable_ui in [false, true] {
        let t = text(&render("#UI L = 6m\nA = L*2", enable_ui, "L", "8 kN"));
        assert!(t.contains("L = 8 kN|m") && t.contains(r#"The calculated units "kN" are inconsistent with the target units "m""#), "ui={enable_ui}: {t}");
    }
    let t = text(&render("#UI L = 6m\nA = L*2", false, "L", "8 kN"));
    assert!(t.contains("on line [ 1 ]"), "{t}");
}

#[test]
fn a_bare_number_is_applied_as_before() {
    let t = text(&render("#UI L = 6m\nA = L*2", false, "L", "5"));
    assert!(t.contains("L = 5 m") && t.contains("A = L · 2 = 5 m · 2 = 10 m"), "{t}");
}

#[test]
fn a_unit_written_as_the_label_after_the_quote_is_the_declared_unit() {
    let t = text(&render("#UI 'Beam length -'l = 5'm\nA = l*2", false, "l", "5000 mm"));
    assert!(t.contains("5000 mm = 5 m"), "{t}");
    let t = text(&render("#UI 'Beam length -'l = 5'm\nA = l*2", false, "l", "8 kN"));
    assert!(t.contains(r#"inconsistent with the target units "m""#), "{t}");
    // Without a unit the number goes in as before, the label staying a label.
    let t = text(&render("#UI 'Beam length -'l = 5'm\nA = l*2", false, "l", "7"));
    assert!(t.contains("l = 7 m") && !t.contains("Error"), "{t}");
}

#[test]
fn a_plain_number_input_refuses_a_value_with_units() {
    let t = text(&render("#UI k = 3\nA = k*2", false, "k", "5 m"));
    assert!(t.contains("was given with units, but this input is a plain number"), "{t}");
    let t = text(&render("#UI k = 3\nA = k*2", false, "k", "5"));
    assert!(t.contains("k = 5") && !t.contains("Error"), "{t}");
}

#[test]
fn the_bounds_apply_after_the_conversion() {
    let src = "#UI {\"min\": 2, \"max\": 12} L = 6m\nA = L*2";
    let ok = text(&render(src, false, "L", "5000 mm"));
    assert!(ok.contains("= 5 m") && !ok.contains("outside the range"), "{ok}");
    let high = text(&render(src, false, "L", "15000 mm"));
    assert!(high.contains("is outside the range 2 to 12"), "{high}");
    let low = text(&render(src, false, "L", "1500 mm"));
    assert!(low.contains("is outside the range 2 to 12"), "{low}");
    // A clash is reported by the conversion, not as a bound.
    let clash = text(&render(src, false, "L", "8 kN"));
    assert!(clash.contains("inconsistent") && !clash.contains("outside the range"), "{clash}");
    // A bare number is judged as it always was.
    assert!(text(&render(src, false, "L", "15")).contains("is outside the range 2 to 12"));
}

#[test]
fn choices_and_expressions_are_untouched() {
    let t = text(&render("#UI {\"type\": \"dropdown\", \"keys\": [\"a\", \"b\"], \"values\": [\"1\", \"2\"]} s = 1\nA = s*2", false, "s", "2"));
    assert!(t.contains("A = s · 2"), "{t}");
}
