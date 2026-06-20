import os
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_incident_pdf(incident_data: dict, prediction_data: dict, resource_data: dict, diversion_data: dict) -> BytesIO:
    """
    Generates a professional Bengaluru Traffic Police incident report PDF.
    """
    buffer = BytesIO()
    
    # 0.5 inch margins
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=letter,
        rightMargin=36, 
        leftMargin=36, 
        topMargin=36, 
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F172A'), # slate-900
        alignment=0 # Left
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#64748B'), # slate-500
        alignment=0
    )
    
    header_style = ParagraphStyle(
        'SecHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#1E3A8A'), # deep navy
        spaceBefore=10,
        spaceAfter=6
    )
    
    label_style = ParagraphStyle(
        'Label',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor('#334155')
    )
    
    value_style = ParagraphStyle(
        'Value',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor('#0F172A')
    )
    
    story = []
    
    # --- Header ---
    story.append(Paragraph("BANGALORE TRAFFIC POLICE COMMAND CENTER", title_style))
    story.append(Paragraph("SMARTFLOW AI - TRAFFIC INCIDENT INTELLIGENCE REPORT", subtitle_style))
    story.append(Spacer(1, 10))
    
    # Thin divider line
    divider = Table([['']], colWidths=[540])
    divider.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 1.5, colors.HexColor('#1E3A8A')),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(divider)
    story.append(Spacer(1, 12))
    
    # --- Document Metadata ---
    meta_data = [
        [
            Paragraph("Report ID:", label_style), 
            Paragraph(f"BTP-SF-{incident_data.get('id', 'N/A')}", value_style),
            Paragraph("Report Generated:", label_style), 
            Paragraph(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), value_style)
        ],
        [
            Paragraph("Source Center:", label_style), 
            Paragraph("Bengaluru Traffic Control Room", value_style),
            Paragraph("Operator ID:", label_style), 
            Paragraph("BTP-OP-449", value_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[90, 180, 110, 160])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 15))
    
    # --- Section 1: Incident Parameters ---
    story.append(Paragraph("1. Incident Parameters", header_style))
    
    incident_grid = [
        [
            Paragraph("Incident Type:", label_style), 
            Paragraph(incident_data.get("event_type", "N/A"), value_style),
            Paragraph("Junction Name:", label_style), 
            Paragraph(incident_data.get("junction", "N/A"), value_style)
        ],
        [
            Paragraph("Incident Cause:", label_style), 
            Paragraph(incident_data.get("event_cause", "N/A"), value_style),
            Paragraph("Corridor Road:", label_style), 
            Paragraph(incident_data.get("corridor", "N/A"), value_style)
        ],
        [
            Paragraph("Current Status:", label_style), 
            Paragraph(incident_data.get("status", "Active"), value_style),
            Paragraph("Police Zone:", label_style), 
            Paragraph(incident_data.get("zone", "N/A"), value_style)
        ],
        [
            Paragraph("Priority Level:", label_style), 
            Paragraph(incident_data.get("priority", "N/A"), value_style),
            Paragraph("Jurisdiction PS:", label_style), 
            Paragraph(incident_data.get("police_station", "N/A"), value_style)
        ],
        [
            Paragraph("Vehicle Type:", label_style), 
            Paragraph(incident_data.get("vehicle_type", "N/A"), value_style),
            Paragraph("Coordinates:", label_style), 
            Paragraph(f"{incident_data.get('latitude', 0.0)}, {incident_data.get('longitude', 0.0)}", value_style)
        ],
        [
            Paragraph("Start Datetime:", label_style), 
            Paragraph(str(incident_data.get("start_datetime", "N/A")), value_style),
            Paragraph("Road Closure?", label_style), 
            Paragraph("Yes" if incident_data.get("requires_road_closure", False) else "No", value_style)
        ]
    ]
    incident_table = Table(incident_grid, colWidths=[90, 180, 110, 160])
    incident_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(incident_table)
    story.append(Spacer(1, 15))
    
    # --- Section 2: AI Predictive Analysis ---
    story.append(Paragraph("2. AI Predictive Analytics (CatBoost / XGBoost)", header_style))
    
    predict_grid = [
        [
            Paragraph("Predicted Clearance Time:", label_style),
            Paragraph(f"{prediction_data.get('predicted_clearance_time_mins', 0)} minutes", value_style)
        ],
        [
            Paragraph("Predicted Incident Impact:", label_style),
            Paragraph(prediction_data.get("predicted_impact_level", "N/A"), value_style)
        ],
        [
            Paragraph("Road Closure Prob. / Req:", label_style),
            Paragraph(f"{round(prediction_data.get('road_closure_probability', 0.0) * 100, 1)}% / " + 
                      ("Required" if prediction_data.get("requires_road_closure_prediction", False) else "Not Required"), value_style)
        ]
    ]
    predict_table = Table(predict_grid, colWidths=[180, 360])
    predict_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F0FDF4')), # soft green background
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#BBF7D0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(predict_table)
    story.append(Spacer(1, 15))
    
    # --- Section 3: Recommended Resource & Diversion Plan ---
    story.append(Paragraph("3. Smart City Resource Deployment & Diversion Plan", header_style))
    
    resource_grid = [
        [
            Paragraph("Traffic Officers Deployed:", label_style),
            Paragraph(f"{resource_data.get('traffic_officers', 0)} Officers recommended", value_style)
        ],
        [
            Paragraph("Road Barricades Required:", label_style),
            Paragraph(f"{resource_data.get('barricades', 0)} units recommended", value_style)
        ],
        [
            Paragraph("Tow Trucks Required:", label_style),
            Paragraph(f"{resource_data.get('tow_trucks', 0)} heavy/standard trucks recommended", value_style)
        ]
    ]
    resource_table = Table(resource_grid, colWidths=[180, 360])
    resource_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(resource_table)
    story.append(Spacer(1, 10))
    
    # Routing details
    route_path_str = " -> ".join(diversion_data.get("path", [])) if diversion_data and diversion_data.get("path") else "Direct path is open."
    routing_grid = [
        [
            Paragraph("Diverted Traffic Path:", label_style),
            Paragraph(route_path_str, value_style)
        ],
        [
            Paragraph("Routing Instructions:", label_style),
            Paragraph(diversion_data.get("diversion_details", "No diversion needed."), value_style)
        ]
    ]
    routing_table = Table(routing_grid, colWidths=[180, 360])
    routing_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#EFF6FF')), # light blue
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#BFDBFE')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(routing_table)
    story.append(Spacer(1, 30))
    
    # --- Footer Signatures ---
    sig_data = [
        [
            Paragraph("_____________________________<br/>On-Duty Supervisor", value_style),
            Paragraph("_____________________________<br/>Command Center Superintendent", value_style)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[270, 270])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(sig_table)
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_commissioner_report_pdf(stats_data, active_incidents, hotspots_data, forecast_data=None):
    """Generate a Commissioner-level executive daily briefing report."""
    from datetime import datetime
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=40, bottomMargin=40, leftMargin=40, rightMargin=40)
    elements = []
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle('CommTitle', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#003366'), spaceAfter=6, alignment=1)
    subtitle_style = ParagraphStyle('CommSubtitle', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#666666'), alignment=1, spaceAfter=20)
    section_style = ParagraphStyle('CommSection', parent=styles['Heading2'], fontSize=13, textColor=colors.HexColor('#003366'), spaceBefore=18, spaceAfter=8, borderColor=colors.HexColor('#003366'), borderWidth=0, borderPadding=0)
    body_style = ParagraphStyle('CommBody', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#333333'), spaceAfter=4, leading=14)
    highlight_style = ParagraphStyle('CommHighlight', parent=styles['Normal'], fontSize=11, textColor=colors.HexColor('#CC0000'), spaceAfter=4, leading=14)
    
    # Header
    elements.append(Paragraph("BANGALORE TRAFFIC POLICE", title_style))
    elements.append(Paragraph("SMARTFLOW AI — DAILY COMMISSIONER BRIEFING REPORT", subtitle_style))
    elements.append(Paragraph(f"Report Generated: {datetime.now().strftime('%d %B %Y, %H:%M IST')}", ParagraphStyle('DateStyle', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#999999'), alignment=1, spaceAfter=10)))
    
    # Divider
    elements.append(Table([['']],colWidths=[480], rowHeights=[2], style=TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#003366')),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)])))
    elements.append(Spacer(1, 12))
    
    # Section 1: Executive Summary
    elements.append(Paragraph("1. EXECUTIVE SUMMARY", section_style))
    
    total = stats_data.get('total_incidents', 0)
    active = stats_data.get('active_incidents', 0)
    avg_clear = stats_data.get('avg_clearance_time_mins', 0)
    closure_rate = stats_data.get('road_closure_rate', 0)
    
    summary_data = [
        ['Metric', 'Value'],
        ['Date of Report', datetime.now().strftime('%d %B %Y')],
        ['Total Incidents Logged', str(total)],
        ['Currently Active', str(active)],
        ['Average Clearance Time', f'{avg_clear} minutes'],
        ['Road Closure Rate', f'{closure_rate}%'],
        ['Officer Deployment Rate', f"{stats_data.get('officer_deployment_rate', 0)}%"],
    ]
    
    summary_table = Table(summary_data, colWidths=[240, 240])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 10))
    
    # Section 2: Priority Breakdown
    elements.append(Paragraph("2. INCIDENT PRIORITY BREAKDOWN", section_style))
    
    critical = len([i for i in active_incidents if i.get('priority') == 'Critical'])
    high = len([i for i in active_incidents if i.get('priority') == 'High'])
    medium = len([i for i in active_incidents if i.get('priority') == 'Medium'])
    low = len([i for i in active_incidents if i.get('priority') == 'Low'])
    
    priority_data = [
        ['Priority', 'Count', 'Action Required'],
        ['CRITICAL', str(critical), 'Immediate Response' if critical > 0 else 'None'],
        ['HIGH', str(high), 'Priority Deployment' if high > 0 else 'None'],
        ['MEDIUM', str(medium), 'Standard Response' if medium > 0 else 'None'],
        ['LOW', str(low), 'Monitoring' if low > 0 else 'None'],
    ]
    
    priority_table = Table(priority_data, colWidths=[120, 120, 240])
    priority_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('TEXTCOLOR', (0, 1), (0, 1), colors.HexColor('#CC0000')),
        ('TEXTCOLOR', (0, 2), (0, 2), colors.HexColor('#FF8800')),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(priority_table)
    elements.append(Spacer(1, 10))
    
    # Section 3: Top Active Incidents
    elements.append(Paragraph("3. ACTIVE INCIDENTS REQUIRING ATTENTION", section_style))
    
    for idx, inc in enumerate(active_incidents[:5]):
        inc_text = f"<b>#{idx+1}. {inc.get('event_type', 'Unknown')}</b> at {inc.get('junction', 'Unknown')} — Priority: {inc.get('priority', 'N/A')}, Corridor: {inc.get('corridor', 'N/A')}"
        elements.append(Paragraph(inc_text, body_style))
    
    if not active_incidents:
        elements.append(Paragraph("No active incidents at this time.", body_style))
    
    elements.append(Spacer(1, 10))
    
    # Section 4: Congestion Hotspots
    elements.append(Paragraph("4. CONGESTION HOTSPOTS (DBSCAN ANALYSIS)", section_style))
    
    if hotspots_data:
        for h in hotspots_data[:5]:
            h_text = f"Cluster at ({h.get('latitude', 0):.4f}, {h.get('longitude', 0):.4f}) — {h.get('incident_count', 0)} incidents, Severity: {h.get('severity', 'N/A')}"
            elements.append(Paragraph(h_text, body_style))
    else:
        elements.append(Paragraph("No significant congestion clusters detected.", body_style))
    
    elements.append(Spacer(1, 10))
    
    # Section 5: Recommendations
    elements.append(Paragraph("5. RECOMMENDED ACTIONS", section_style))
    
    recommendations = []
    if critical > 0:
        recommendations.append("Deploy emergency response teams to all CRITICAL incident locations immediately.")
    if high >= 3:
        recommendations.append(f"Increase officer deployment — {high} HIGH priority incidents require attention.")
    if len(hotspots_data or []) >= 2:
        recommendations.append(f"Activate traffic diversion protocols at {len(hotspots_data)} identified congestion hotspots.")
    if float(closure_rate) > 20:
        recommendations.append(f"Road closure rate at {closure_rate}% — coordinate with BBMP for expedited clearance.")
    if avg_clear and float(avg_clear) > 60:
        recommendations.append(f"Average clearance time ({avg_clear} min) exceeds target. Deploy additional tow trucks.")
    if not recommendations:
        recommendations.append("City traffic operations are within normal parameters. Continue standard monitoring.")
    
    for idx, rec in enumerate(recommendations):
        elements.append(Paragraph(f"{idx+1}. {rec}", body_style))
    
    elements.append(Spacer(1, 20))
    
    # Footer signatures
    elements.append(Table([['']],colWidths=[480], rowHeights=[1], style=TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#CCCCCC'))])))
    elements.append(Spacer(1, 20))
    
    sig_data = [
        ['_________________________', '_________________________'],
        ['Traffic Commissioner', 'SMARTFLOW AI System'],
        ['Bangalore Traffic Police', f'Report ID: BTP-CR-{datetime.now().strftime("%Y%m%d%H%M")}']
    ]
    sig_table = Table(sig_data, colWidths=[240, 240])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#666666')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(sig_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
