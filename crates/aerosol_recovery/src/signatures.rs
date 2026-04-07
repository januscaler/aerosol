//! Extensible magic-byte registry for carving and classification.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileSignature {
    pub id: &'static str,
    pub extensions: &'static [&'static str],
    pub magic: &'static [u8],
    pub anchor_start: bool,
}

static PNG_MAGIC: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
static JPEG_MAGIC: [u8; 3] = [0xff, 0xd8, 0xff];
static ZIP_MAGIC: [u8; 4] = [0x50, 0x4b, 0x03, 0x04];
static PDF_MAGIC: [u8; 5] = *b"%PDF-";
static SQLITE_MAGIC: [u8; 16] = *b"SQLite format 3\0";

pub const ALL_SIGNATURES: &[FileSignature] = &[
    FileSignature {
        id: "png",
        extensions: &["png"],
        magic: &PNG_MAGIC,
        anchor_start: true,
    },
    FileSignature {
        id: "jpeg",
        extensions: &["jpg", "jpeg"],
        magic: &JPEG_MAGIC,
        anchor_start: true,
    },
    FileSignature {
        id: "zip",
        extensions: &["zip", "jar", "apk", "docx", "pptx", "xlsx"],
        magic: &ZIP_MAGIC,
        anchor_start: false,
    },
    FileSignature {
        id: "pdf",
        extensions: &["pdf"],
        magic: &PDF_MAGIC,
        anchor_start: true,
    },
    FileSignature {
        id: "mp4",
        extensions: &["mp4", "m4v"],
        magic: b"ftyp",
        anchor_start: false,
    },
    FileSignature {
        id: "sqlite",
        extensions: &["db", "sqlite", "sqlite3"],
        magic: &SQLITE_MAGIC,
        anchor_start: true,
    },
    FileSignature {
        id: "json",
        extensions: &["json"],
        magic: b"{",
        anchor_start: true,
    },
];

pub fn enabled_signatures(enabled: &[String]) -> Vec<FileSignature> {
    if enabled.is_empty() {
        return ALL_SIGNATURES.to_vec();
    }
    let out: Vec<FileSignature> = ALL_SIGNATURES
        .iter()
        .copied()
        .filter(|s| {
            enabled
                .iter()
                .any(|e| e.eq_ignore_ascii_case(s.id))
        })
        .collect();
    if out.is_empty() {
        ALL_SIGNATURES.to_vec()
    } else {
        out
    }
}

/// Find first matching signature at start of buffer.
pub fn match_magic_prefix(buf: &[u8], sigs: &[FileSignature]) -> Option<FileSignature> {
    for s in sigs {
        if buf.len() < s.magic.len() && s.id != "mp4" && s.id != "json" {
            continue;
        }
        if s.id == "mp4" {
            if buf.len() >= 12 && buf[4..8] == *b"ftyp" {
                return Some(*s);
            }
            continue;
        }
        if s.id == "json" {
            let t = buf.iter().position(|b| !b.is_ascii_whitespace()).unwrap_or(0);
            if t < buf.len() && (buf[t] == b'{' || buf[t] == b'[') {
                return Some(*s);
            }
            continue;
        }
        if buf.len() >= s.magic.len() && buf[..s.magic.len()] == *s.magic {
            return Some(*s);
        }
    }
    None
}

fn extension_hint(path: &std::path::Path, sigs: &[FileSignature]) -> Option<FileSignature> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())?;
    sigs.iter().copied().find(|s| s.extensions.iter().any(|e| *e == ext.as_str()))
}

pub fn classify_prefix_and_ext(path: &std::path::Path, buf: &[u8], sigs: &[FileSignature]) -> (Option<FileSignature>, Option<FileSignature>) {
    (match_magic_prefix(buf, sigs), extension_hint(path, sigs))
}

/// Carve: scan buffer for signature starts (512-byte aligned).
pub fn carve_offsets(data: &[u8], sigs: &[FileSignature]) -> Vec<(usize, FileSignature)> {
    let mut hits = Vec::new();
    const STRIDE: usize = 512;
    let mut i = 0;
    while i + 8 <= data.len() {
        let slice = &data[i..];
        for s in sigs {
            if s.id == "mp4" {
                if slice.len() >= 12 && slice[4..8] == *b"ftyp" {
                    hits.push((i, *s));
                }
                continue;
            }
            if slice.len() >= s.magic.len() && slice[..s.magic.len()] == *s.magic {
                hits.push((i, *s));
            }
        }
        i += STRIDE;
    }
    hits
}
