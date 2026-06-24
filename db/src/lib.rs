pub mod models;
mod schema;

use diesel::ConnectionError;
use diesel::ConnectionResult;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::ManagerConfig;
use diesel_async::pooled_connection::bb8::Pool;
use futures_util::FutureExt;
use futures_util::future::BoxFuture;
use redis::PushInfo;
use redis::aio::ConnectionManager;
use redis::aio::ConnectionManagerConfig;
use rustls::ClientConfig;
use rustls::RootCertStore;
use rustls::pki_types::CertificateDer;
use rustls::pki_types::pem::PemObject;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::Duration;

const CERT: &[u8] = include_bytes!("cert.crt");

pub async fn get_connection(url: &str) -> Pool<AsyncPgConnection> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    let mut config = ManagerConfig::default();
    config.custom_setup = Box::new(establish_connection);
    let mgr = AsyncDieselConnectionManager::<AsyncPgConnection>::new_with_config(url, config);

    Pool::builder()
        .max_size(10)
        .min_idle(Some(5))
        .max_lifetime(Some(Duration::from_secs(60 * 60 * 24)))
        .idle_timeout(Some(Duration::from_secs(60 * 2)))
        .build(mgr)
        .await
        .unwrap()
}

fn establish_connection(config: &str) -> BoxFuture<'_, ConnectionResult<AsyncPgConnection>> {
    let fut = async {
        let mut root_store = RootCertStore::empty();
        let cert = CertificateDer::from_pem_slice(CERT).unwrap();

        root_store.add(cert).unwrap();
        let rustls_config = ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth();

        let tls = tokio_postgres_rustls::MakeRustlsConnect::new(rustls_config);
        let (client, conn) = tokio_postgres::connect(config, tls)
            .await
            .map_err(|e| ConnectionError::BadConnection(e.to_string()))?;

        AsyncPgConnection::try_from_client_and_connection(client, conn).await
    };
    fut.boxed()
}

pub async fn get_redis_connection(url: &str) -> ConnectionManager {
    let client = redis::Client::open(url).expect("Failed to create Redis client");
    let manager_config = ConnectionManagerConfig::new()
        .set_response_timeout(Some(Duration::from_secs(5)))
        .set_number_of_retries(5)
        .set_connection_timeout(Some(Duration::from_secs(5)));

    ConnectionManager::new_with_config(client, manager_config)
        .await
        .unwrap()
}

pub async fn get_redis_pubsub(url: &str, sender: UnboundedSender<PushInfo>) -> ConnectionManager {
    let client = redis::Client::open(url).expect("Failed to create Redis client");
    let manager_config = ConnectionManagerConfig::new()
        .set_automatic_resubscription()
        .set_response_timeout(Some(Duration::from_secs(5)))
        .set_number_of_retries(5)
        .set_connection_timeout(Some(Duration::from_secs(5)))
        .set_push_sender(sender);

    ConnectionManager::new_with_config(client, manager_config)
        .await
        .unwrap()
}
