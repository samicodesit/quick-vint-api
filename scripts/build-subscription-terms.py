"""Offline PDF build: python -m pip install reportlab==5.1.0.

Run after editing an UNRELEASED policy. Never rewrite a released version.
The generated JSON embeds the PDF so serverless sends need no file fetch.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

rl_config.invariant = 1
root = Path(__file__).resolve().parents[1]
source = root / "src/data/subscription-policy-2026-10-28.json"
policy = json.loads(source.read_text(encoding="utf-8"))
buffer = io.BytesIO()
doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=48, leftMargin=48,
                       topMargin=48, bottomMargin=48,
                       title="AutoLister subscription terms " + policy["version"],
                       author="AutoLister AI")
body = ParagraphStyle("Body", fontName="Helvetica", fontSize=10, leading=14,
                      textColor=colors.HexColor("#374151"), spaceAfter=10,
                      alignment=TA_LEFT)
heading = ParagraphStyle("Heading", parent=body, fontName="Helvetica-Bold",
                         fontSize=12, leading=16, spaceBefore=12, keepWithNext=True)
title = ParagraphStyle("Title", parent=heading, fontSize=21, leading=26,
                       textColor=colors.HexColor("#764BA2"))
story = [Paragraph("AutoLister AI", title),
         Paragraph("Subscription terms | " + policy["version"], heading),
         Paragraph(escape(policy["seller"] + ". " + policy["address"] +
                          ". Telephone: " + policy["phone"] + "."), body),
         Paragraph('<link href="mailto:' + policy["email"] + '">' +
                   policy["email"] + '</link>', body), Spacer(1, 6)]
for section in policy["sections"]:
    story += [Paragraph(escape(section["title"]), heading),
              Paragraph(escape(section["text"]), body)]
story.append(Paragraph('<link href="https://autolister.app/withdraw" color="#764BA2">'
                       'Online withdrawal form</link> | '
                       '<link href="mailto:support@autolister.app" color="#764BA2">'
                       'Contact support</link>', body))

def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(48, 28, "AutoLister AI | " + policy["version"])
    canvas.drawRightString(A4[0] - 48, 28, str(document.page))
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
pdf = buffer.getvalue()
asset = {
    "policyVersion": policy["version"],
    "policySha256": hashlib.sha256(json.dumps(policy, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest(),
    "pdfSha256": hashlib.sha256(pdf).hexdigest(),
    "attachment": {
        "filename": "AutoLister-subscription-terms-" + policy["version"] + ".pdf",
        "content": base64.b64encode(pdf).decode(),
        "contentType": "application/pdf",
    },
}
output = source.with_name("subscription-terms-" + policy["version"] + ".json")
output.write_text(json.dumps(asset, indent=2) + "\n", encoding="utf-8")
print("Built " + output.name + ": " + str(len(pdf)) + " PDF bytes")
