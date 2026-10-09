"""Shared explicit aliases for printed native House hierarchy labels."""
import re


def unenumerated(text):
    return re.sub(r'^(?:\d{1,2}|[a-z])[.)]\s+', '', text).strip()


def control_key(label, ancestors=()):
    """Printed label aliases only; amounts never determine control identity."""
    label = unenumerated(label)
    if label.startswith('- '):
        label = ancestors[-1] + ' ' + label
    label = label.replace('Basic Infrastructure Program (BIP) -', 'BIP -')
    label = label.replace('Boat Landing', 'Boat Landings') if label.endswith('Boat Landing') else label
    if label == 'Buildings and Other Structures - Multipurpose / Facilities - National Building Program':
        label = 'National Building Program'
    if label.startswith('Construction/ Rehabilitation of Water Supply/') or \
            label.startswith('Construction/Rehabilitation of Water Supply/'):
        label = 'Water Supply family'
    return re.sub(r'[^a-z0-9]', '', label.casefold())
