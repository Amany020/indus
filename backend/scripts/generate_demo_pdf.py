"""
IndustryMind — Synthetic Demo Manual Generator
Creates a realistic PDF manual for the Conveyor Drive Unit CDU-7500X.
Run: python -m scripts.generate_demo_pdf

Requires: pip install fpdf2
"""

from __future__ import annotations
import sys
import os

try:
    from fpdf import FPDF
except ImportError:
    print("Installing fpdf2...")
    os.system(f"{sys.executable} -m pip install fpdf2")
    from fpdf import FPDF


class ManualPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "CDU-7500X Conveyor Drive Unit | Operations & Maintenance Manual | Rev 3.2", align="C")
        self.ln(10)
        self.set_draw_color(200, 200, 200)
        self.line(10, 18, 200, 18)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}} | CONFIDENTIAL | IndusTech Engineering Pvt. Ltd.", align="C")

    def chapter_title(self, title: str):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(38, 82, 77)  # Primary color
        self.cell(0, 12, title)
        self.ln(14)

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(28, 43, 41)
        self.cell(0, 10, title)
        self.ln(12)

    def body_text(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text)
        self.ln(4)

    def warning_box(self, text: str):
        self.set_fill_color(246, 235, 218)  # Amber light
        self.set_draw_color(184, 118, 47)   # Amber
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(184, 118, 47)
        self.cell(0, 8, "WARNING", border=1, fill=True)
        self.ln(8)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text)
        self.ln(4)

    def spec_table(self, rows: list):
        self.set_font("Helvetica", "B", 10)
        self.set_fill_color(229, 237, 235)  # Primary light
        self.set_text_color(28, 43, 41)
        self.cell(90, 8, "Parameter", border=1, fill=True)
        self.cell(90, 8, "Value", border=1, fill=True)
        self.ln()
        self.set_font("Helvetica", "", 10)
        for param, value in rows:
            self.cell(90, 7, param, border=1)
            self.cell(90, 7, value, border=1)
            self.ln()
        self.ln(6)


def generate():
    pdf = ManualPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ─── Page 1: Cover ──────────────────────────────────────────────────
    pdf.add_page()
    pdf.ln(40)
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(38, 82, 77)
    pdf.cell(0, 15, "CDU-7500X", align="C")
    pdf.ln(18)
    pdf.set_font("Helvetica", "", 18)
    pdf.set_text_color(28, 43, 41)
    pdf.cell(0, 12, "Conveyor Drive Unit", align="C")
    pdf.ln(14)
    pdf.set_font("Helvetica", "", 14)
    pdf.cell(0, 10, "Operations & Maintenance Manual", align="C")
    pdf.ln(20)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, "Revision 3.2 | October 2025", align="C")
    pdf.ln(8)
    pdf.cell(0, 8, "IndusTech Engineering Pvt. Ltd.", align="C")
    pdf.ln(8)
    pdf.cell(0, 8, "Document No: ITL-CDU-7500X-OM-032", align="C")

    # ─── Page 2: Table of Contents ──────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("Table of Contents")
    toc = [
        ("1. Safety Information", 3),
        ("2. Machine Specifications", 4),
        ("3. Installation", 5),
        ("4. Belt Replacement Procedure", 6),
        ("5. Belt Tension Adjustment", 7),
        ("6. Error Codes", 8),
        ("7. Lubrication Schedule", 9),
        ("8. Maintenance Schedule", 10),
        ("9. Troubleshooting Guide", 11),
        ("10. Emergency Procedures", 12),
    ]
    for title, page in toc:
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(150, 8, title)
        pdf.set_font("Courier", "", 11)
        pdf.cell(30, 8, str(page), align="R")
        pdf.ln()

    # ─── Page 3: Safety Information ─────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("1. Safety Information")
    pdf.warning_box(
        "Read all safety instructions before operating this equipment. "
        "Failure to follow safety procedures may result in serious injury or death. "
        "Never bypass, disable, or circumvent any safety interlock, guard, or emergency stop device."
    )
    pdf.section_title("1.1 Lockout/Tagout (LOTO) Procedure")
    pdf.body_text(
        "Before performing any maintenance or repair work on the CDU-7500X:\n"
        "1. Notify all affected personnel\n"
        "2. Shut down the machine using the main control panel\n"
        "3. Turn the main disconnect switch to OFF position\n"
        "4. Apply your personal padlock to the disconnect switch\n"
        "5. Attach a dated and signed lockout tag\n"
        "6. Verify zero energy state by attempting to start the machine\n"
        "7. Verify stored energy is dissipated (hydraulic, pneumatic, electrical)\n"
        "8. Only then begin maintenance work"
    )
    pdf.section_title("1.2 Personal Protective Equipment (PPE)")
    pdf.body_text(
        "Required PPE when working on the CDU-7500X:\n"
        "- Safety glasses with side shields\n"
        "- Steel-toed safety boots\n"
        "- Cut-resistant gloves (Class 3 minimum)\n"
        "- Hearing protection (above 85 dB zones)\n"
        "- High-visibility vest in active production areas"
    )
    pdf.section_title("1.3 Emergency Stop")
    pdf.body_text(
        "The CDU-7500X is equipped with three emergency stop buttons:\n"
        "- Main control panel (red mushroom button)\n"
        "- Drive end station\n"
        "- Tail end station\n\n"
        "To reset the emergency stop after activation:\n"
        "1. Identify and resolve the cause of the emergency stop\n"
        "2. Rotate the e-stop button clockwise to release\n"
        "3. Press the RESET button on the control panel\n"
        "4. Verify all guards are in place before restarting"
    )

    # ─── Page 4: Machine Specifications ─────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("2. Machine Specifications")
    pdf.section_title("2.1 General Specifications")
    pdf.spec_table([
        ("Model", "CDU-7500X"),
        ("Conveyor Length", "12,000 mm"),
        ("Belt Width", "800 mm"),
        ("Belt Speed", "0.3 m/s (adjustable 0.1-0.5 m/s)"),
        ("Maximum Load", "75 kg/m"),
        ("Motor Power", "7.5 kW"),
        ("Motor Speed", "1500 RPM"),
        ("Supply Voltage", "415V AC, 3-phase, 50 Hz"),
        ("Operating Temperature", "0 to 40 deg C ambient"),
        ("Protection Rating", "IP55"),
        ("Weight (empty)", "2,800 kg"),
    ])
    pdf.section_title("2.2 Drive System")
    pdf.spec_table([
        ("Drive Type", "Helical gearbox with frequency inverter"),
        ("Gear Ratio", "25:1"),
        ("Output Torque", "450 Nm maximum"),
        ("Drive Chain", "ISO 10B-1, pitch 15.875 mm"),
        ("Chain Tension", "20 N +/- 3 N"),
        ("Lubrication", "ISO VG 68 mineral oil"),
    ])
    pdf.section_title("2.3 Belt Specifications")
    pdf.spec_table([
        ("Belt Type", "EP 400/3 (3-ply polyester/nylon)"),
        ("Belt Thickness", "8 mm (3+2+3 cover)"),
        ("Belt Tension (operating)", "15 Nm +/- 2 Nm"),
        ("Minimum Pulley Diameter", "315 mm"),
        ("Splice Type", "Vulcanized finger splice"),
    ])

    # ─── Page 5: Installation ───────────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("3. Installation")
    pdf.section_title("3.1 Foundation Requirements")
    pdf.body_text(
        "The CDU-7500X requires a level concrete foundation with minimum "
        "compressive strength of 25 MPa. Foundation bolts: M16 x 200 mm, "
        "Grade 8.8, torque to 190 Nm."
    )
    pdf.section_title("3.2 Electrical Connection")
    pdf.body_text(
        "1. Verify supply voltage: 415V AC +/-10%, 3-phase, 50 Hz\n"
        "2. Cable size: minimum 4 sq mm copper, 4-core (3 phase + earth)\n"
        "3. Circuit breaker: 32A Type D MCB\n"
        "4. Earth resistance: less than 1 ohm\n"
        "5. Motor insulation resistance: minimum 1 Megohm at 500V DC\n"
        "6. Verify phase rotation before first start (clockwise viewing from fan end)"
    )
    pdf.section_title("3.3 Belt Tracking Alignment")
    pdf.body_text(
        "After installation, check belt tracking:\n"
        "1. Run conveyor at low speed (0.1 m/s) with no load\n"
        "2. Observe belt position at head and tail pulleys\n"
        "3. If belt drifts to one side, adjust the corresponding idler\n"
        "4. Turn adjustment screw maximum 1/4 turn at a time\n"
        "5. Wait for 3 full belt revolutions between adjustments\n"
        "6. Belt must run within 10 mm of center at all points\n"
        "7. Lock adjustment screws after alignment is achieved"
    )

    # ─── Page 6: Belt Replacement ───────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("4. Belt Replacement Procedure")
    pdf.warning_box(
        "Perform LOTO procedure (Section 1.1) before belt replacement. "
        "Belt replacement requires minimum 2 qualified technicians. "
        "Use appropriate lifting equipment for belt rolls (weight: approx 180 kg)."
    )
    pdf.body_text(
        "Step 1: Perform lockout/tagout as per Section 1.1\n"
        "Step 2: Release belt tension by loosening the take-up screws (both sides equally)\n"
        "Step 3: Disconnect the belt splice using the vulcanization cutter\n"
        "Step 4: Remove the old belt by pulling from the tail end\n"
        "Step 5: Clean all rollers, pulleys, and idlers; inspect for damage\n"
        "Step 6: Thread the new belt over tail pulley, under return idlers, over drive pulley\n"
        "Step 7: Prepare vulcanized finger splice per belt manufacturer specification\n"
        "Step 8: Adjust belt tension to 15 Nm +/- 2 Nm (see Section 5)\n"
        "Step 9: Perform belt tracking alignment (see Section 3.3)\n"
        "Step 10: Run at 50% speed for 30 minutes, check tension and tracking\n"
        "Step 11: Increase to full speed, run for 1 hour under observation\n"
        "Step 12: Record belt replacement in maintenance log"
    )
    pdf.body_text(
        "Estimated time: 4-6 hours for experienced technicians.\n"
        "Required tools: 17mm and 19mm wrenches, torque wrench (range 5-50 Nm), "
        "belt tension gauge, vulcanization press, belt cutter, lifting slings."
    )

    # ─── Page 7: Belt Tension Adjustment ────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("5. Belt Tension Adjustment")
    pdf.body_text(
        "Proper belt tension is critical for reliable operation. Insufficient "
        "tension causes belt slip; excessive tension accelerates belt and "
        "bearing wear.\n\n"
        "Target tension: 15 Nm +/- 2 Nm\n\n"
        "Measurement procedure:\n"
        "1. Stop the conveyor and perform LOTO\n"
        "2. Place the tension gauge at the mid-span of the return side\n"
        "3. Deflect the belt 25 mm and read the force\n"
        "4. Calculate tension: T = F x L / 4 (where L = span in meters)\n"
        "5. Acceptable range: 13 Nm to 17 Nm\n\n"
        "Adjustment procedure:\n"
        "1. Loosen the lock nuts on both take-up screws\n"
        "2. Turn both take-up screws equally (maximum 1/2 turn at a time)\n"
        "3. Clockwise to increase tension, counter-clockwise to decrease\n"
        "4. Re-measure tension after each adjustment\n"
        "5. Tighten lock nuts to 25 Nm when target is achieved\n"
        "6. Verify belt tracking after tension adjustment"
    )

    # ─── Page 8: Error Codes ────────────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("6. Error Codes")
    pdf.body_text(
        "The CDU-7500X control system displays error codes on the HMI panel. "
        "All error codes are prefixed with 'E-' followed by a three-digit number."
    )
    pdf.section_title("6.1 Error Code Reference Table")
    errors = [
        ("E-100", "Drive overload", "Check belt tension, load, and motor current"),
        ("E-101", "Drive overcurrent", "Check motor windings and connections"),
        ("E-150", "Inverter fault", "Reset inverter; check for short circuit"),
        ("E-200", "Belt slip detected", "Check belt tension (Section 5)"),
        ("E-201", "Belt misalignment", "Check belt tracking (Section 3.3)"),
        ("E-247", "Motor overheat", "Check ventilation duct, clean fan guard, verify ambient temp below 40 deg C. "
                                     "If E-247 persists after cleaning, check thermal relay setting (95 deg C +/- 5 deg C). "
                                     "Inspect motor bearings for excessive friction."),
        ("E-300", "Emergency stop active", "Identify cause, reset e-stop (Section 1.3)"),
        ("E-301", "Safety guard open", "Close all safety guards before operation"),
        ("E-400", "Communication fault", "Check PLC-HMI cable, restart controller"),
        ("E-500", "Encoder failure", "Check encoder cable and connections"),
    ]
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(229, 237, 235)
    pdf.cell(25, 7, "Code", border=1, fill=True)
    pdf.cell(45, 7, "Description", border=1, fill=True)
    pdf.cell(120, 7, "Action Required", border=1, fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for code, desc, action in errors:
        h = pdf.get_string_width(action)
        row_h = 7 if h < 120 else 14
        pdf.cell(25, row_h, code, border=1)
        pdf.cell(45, row_h, desc, border=1)
        x, y = pdf.get_x(), pdf.get_y()
        pdf.multi_cell(120, 7, action, border=1)
        pdf.set_xy(x + 120, y + row_h if row_h == 7 else y + 14)
        pdf.ln(0)

    # ─── Page 9: Lubrication Schedule ───────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("7. Lubrication Schedule")
    pdf.body_text(
        "Use only approved lubricants. Mixing different lubricant types "
        "may cause equipment damage."
    )
    pdf.spec_table([
        ("Drive chain", "ISO VG 68 mineral oil, every 500 hours"),
        ("Gearbox", "ISO VG 220 synthetic, check monthly, change every 5000 hours"),
        ("Drive bearings", "NLGI Grade 2 lithium grease, every 2000 hours"),
        ("Idler bearings", "NLGI Grade 2 lithium grease, every 4000 hours"),
        ("Take-up screws", "Anti-seize compound, every belt change"),
    ])
    pdf.section_title("7.1 Lubrication Points")
    pdf.body_text(
        "The CDU-7500X has 12 lubrication points:\n"
        "- 2x drive shaft bearings (grease nipples, left and right)\n"
        "- 2x tail shaft bearings (grease nipples, left and right)\n"
        "- 4x return idler bearings (grease nipples)\n"
        "- 1x drive chain (drip oiler or manual application)\n"
        "- 1x gearbox (oil level sight glass, drain plug at bottom)\n"
        "- 2x take-up screw threads (manual application)\n\n"
        "All lubrication points are marked with yellow tags on the machine."
    )

    # ─── Page 10: Maintenance Schedule ──────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("8. Maintenance Schedule")
    pdf.section_title("8.1 Daily Checks")
    pdf.body_text(
        "- Visual inspection of belt condition and tracking\n"
        "- Check for unusual noise or vibration\n"
        "- Verify all safety guards are in place\n"
        "- Check drive chain tension (visual)\n"
        "- Record operating hours"
    )
    pdf.section_title("8.2 Weekly Checks")
    pdf.body_text(
        "- Measure belt tension (target: 15 Nm +/- 2 Nm)\n"
        "- Inspect belt edges for wear or damage\n"
        "- Check motor current (should be below 80% of rated)\n"
        "- Clean photoelectric sensors\n"
        "- Check emergency stop function"
    )
    pdf.section_title("8.3 Monthly Checks")
    pdf.body_text(
        "- Gearbox oil level (top up if below sight glass)\n"
        "- Drive chain tension measurement\n"
        "- Roller and idler rotation check\n"
        "- Electrical connection tightness\n"
        "- Motor insulation resistance (minimum 1 Megohm)"
    )
    pdf.section_title("8.4 Annual Overhaul")
    pdf.body_text(
        "- Complete belt inspection and replacement if worn\n"
        "- Gearbox oil change\n"
        "- All bearing lubrication\n"
        "- Electrical system inspection\n"
        "- Safety device testing and certification\n"
        "- Alignment verification"
    )

    # ─── Page 11: Troubleshooting ───────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("9. Troubleshooting Guide")
    troubles = [
        ("Belt slipping", "Low belt tension", "Adjust tension to 15 Nm (Section 5)"),
        ("Belt slipping", "Wet or oily belt surface", "Clean belt and pulleys; identify source of contamination"),
        ("Belt drifting to one side", "Misaligned idlers", "Realign idlers (Section 3.3)"),
        ("Belt drifting to one side", "Uneven loading", "Check material feed distribution"),
        ("Excessive vibration", "Bearing failure", "Replace bearings; check alignment"),
        ("Excessive vibration", "Damaged roller", "Replace damaged roller"),
        ("Motor overheating (E-247)", "Blocked ventilation", "Clean motor fan and ventilation duct"),
        ("Motor overheating (E-247)", "Overload condition", "Check load; verify belt tension"),
        ("Motor overheating (E-247)", "High ambient temperature", "Ensure ambient below 40 deg C"),
        ("Unusual noise from drive", "Worn drive chain", "Inspect and replace chain if elongation > 2%"),
        ("Unusual noise from drive", "Low gearbox oil", "Check and top up gearbox oil level"),
        ("Conveyor won't start", "E-stop active", "Reset e-stop (Section 1.3)"),
        ("Conveyor won't start", "Safety guard open", "Close all guards; check interlock switches"),
    ]
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(229, 237, 235)
    pdf.cell(50, 7, "Symptom", border=1, fill=True)
    pdf.cell(50, 7, "Possible Cause", border=1, fill=True)
    pdf.cell(90, 7, "Corrective Action", border=1, fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for symptom, cause, action in troubles:
        pdf.cell(50, 7, symptom, border=1)
        pdf.cell(50, 7, cause, border=1)
        pdf.cell(90, 7, action, border=1)
        pdf.ln()

    # ─── Page 12: Emergency Procedures ──────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("10. Emergency Procedures")
    pdf.warning_box(
        "In case of fire, injury, or equipment failure that poses immediate danger: "
        "1) Press the nearest emergency stop button. "
        "2) Evacuate the area. "
        "3) Call emergency services. "
        "4) Notify your supervisor. "
        "Do NOT attempt to restart equipment after a serious incident."
    )
    pdf.section_title("10.1 Belt Jam Procedure")
    pdf.body_text(
        "1. Press emergency stop immediately\n"
        "2. Do NOT attempt to clear the jam while any part is moving\n"
        "3. Perform LOTO (Section 1.1)\n"
        "4. Clear the jammed material manually\n"
        "5. Inspect belt for damage before restarting\n"
        "6. Document the incident in the maintenance log"
    )
    pdf.section_title("10.2 Electrical Emergency")
    pdf.body_text(
        "1. Do NOT touch the equipment if electrical fault is suspected\n"
        "2. Turn off main disconnect from a safe distance using insulated tools\n"
        "3. If a person is in contact with live equipment, do NOT touch them\n"
        "4. Call emergency services immediately\n"
        "5. Use appropriate fire extinguisher (CO2 or dry powder) for electrical fires"
    )

    # Save
    output_path = os.path.join(os.path.dirname(__file__), "..", "demo_data", "CDU-7500X_Manual_Rev3.2.pdf")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    pdf.output(output_path)
    print(f"Generated: {output_path}")
    print(f"Pages: {pdf.pages_count}")


if __name__ == "__main__":
    generate()
