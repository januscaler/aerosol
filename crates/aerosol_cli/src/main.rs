use aerosol_core::analyzer::format_bytes;
use aerosol_core::duplicates::find_duplicates;
use aerosol_core::engine;
use aerosol_core::cleanup;
use aerosol_core::types::{CleanRequest, ScanOptions};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[derive(Parser)]
#[command(name = "aerosol", version, about = "Developer-aware disk optimizer")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Scan default roots and print JSON summary to stdout
    Scan {
        #[arg(long, default_value_t = false)]
        include_dangerous: bool,
        #[arg(long, default_value_t = 8)]
        max_depth: usize,
    },
    /// Remove paths (use trash by default)
    Clean {
        #[arg(required = true)]
        paths: Vec<PathBuf>,
        #[arg(long, default_value_t = false)]
        dry_run: bool,
        #[arg(long, default_value_t = true)]
        trash: bool,
    },
    /// Find duplicate files among large file paths from a JSON lines file (paths only)
    Duplicates {
        #[arg(required = true)]
        paths_file: PathBuf,
        #[arg(long, default_value_t = 10 * 1024 * 1024)]
        min_bytes: u64,
    },
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Scan {
            include_dangerous,
            max_depth,
        } => {
            let options = ScanOptions {
                max_depth: Some(max_depth),
                include_dangerous,
                ..Default::default()
            };
            let cancel = Arc::new(AtomicBool::new(false));
            let result = engine::scan(options, cancel)?;
            println!("{}", serde_json::to_string_pretty(&result)?);
            println!(
                "# Totals: {} reclaimable (safe {} | review {} | dangerous {})",
                format_bytes(result.totals.total_bytes),
                format_bytes(result.totals.safe_bytes),
                format_bytes(result.totals.review_bytes),
                format_bytes(result.totals.dangerous_bytes),
            );
        }
        Commands::Clean {
            paths,
            dry_run,
            trash,
        } => {
            let req = CleanRequest {
                paths: paths.iter().map(|p| p.to_string_lossy().to_string()).collect(),
                dry_run,
                use_trash: trash,
            };
            let out = cleanup::clean(req)?;
            println!("{}", serde_json::to_string_pretty(&out)?);
        }
        Commands::Duplicates {
            paths_file,
            min_bytes,
        } => {
            let text = std::fs::read_to_string(&paths_file)?;
            let candidates: Vec<PathBuf> = text
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .map(PathBuf::from)
                .collect();
            let groups = find_duplicates(&candidates, min_bytes)?;
            println!("{}", serde_json::to_string_pretty(&groups)?);
        }
    }
    Ok(())
}
