;; title: stream
;; version:
;; summary:
;; description:

;; errors
(define-constant ERR_UNAUTHORIZED (err u0))
(define-constant ERR_INVALID_SIGNATURE (err u1))
(define-constant ERR_STREAM_STILL_ACTIVE (err u2))
(define-constant ERR_INVALID_STREAM_ID (err u3))

;; data vars
(define-data-var latest-stream-id uint u0)

;; mapping 
(define-map streams
    uint ;; stream-id
    {
        sender: principal,
        recipient: principal,
        balance: uint,
        widthdrawn-balance: uint,
        payment-per-block: uint,
        timeframe:         {
            start-block: uint,
            stop-block: uint,
        },
    }
)
