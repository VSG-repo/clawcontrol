"""System metrics using psutil."""
import psutil
from typing import Optional


def get_cpu_temp() -> Optional[float]:
    """Try multiple methods to get CPU temperature."""
    try:
        temps = psutil.sensors_temperatures()
        for key in ("coretemp", "k10temp", "cpu_thermal", "acpitz"):
            if key in temps and temps[key]:
                return temps[key][0].current
        # Fallback: any sensor
        for entries in temps.values():
            if entries:
                return entries[0].current
    except Exception:
        pass
    # Try reading directly
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return int(f.read().strip()) / 1000.0
    except Exception:
        pass
    return None


def get_metrics() -> dict:
    cpu_pct = psutil.cpu_percent(interval=0.1)
    cpu_temp = get_cpu_temp()
    cpu_freq = psutil.cpu_freq()
    cpu_throttled = False
    if cpu_freq and cpu_freq.max > 0:
        cpu_throttled = (cpu_freq.current < cpu_freq.max * 0.7) and (cpu_temp or 0) > 75

    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    disk_inode_warning = False

    return {
        "cpu_percent": round(cpu_pct, 1),
        "cpu_temp": round(cpu_temp, 1) if cpu_temp is not None else None,
        "cpu_throttled": cpu_throttled,
        "ram_used_gb": round(mem.used / (1024 ** 3), 2),
        "ram_total_gb": round(mem.total / (1024 ** 3), 2),
        "ram_percent": round(mem.percent, 1),
        "disk_percent": round(disk.percent, 1),
        "disk_inode_warning": disk_inode_warning,
        "net_outbound_mbps": 0.0,  # rate computed in WS loop via delta
        "net_packet_loss": 0.0,  # would require ping — stub for now
        "openrouter_reachable": True,  # probed async separately
    }
