type RequestLike = {
  url?: string;
};

type ResponseLike = {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

type VercelHandler = (request: RequestLike, response: ResponseLike) => Promise<void>;

let cachedHandler: VercelHandler | undefined;

async function getApiHandler(): Promise<VercelHandler> {
  if (cachedHandler) {
    return cachedHandler;
  }

  const apiHandlerPath = '../apps/api/api/index';
  const module = (await import(apiHandlerPath)) as { default: VercelHandler };
  cachedHandler = module.default;
  return cachedHandler;
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.url === '/' || request.url?.startsWith('/favicon.')) {
    response.status(200).json({
      status: 'ok',
      service: 'digital-mandal-api',
      docs: '/api/docs',
      health: '/api/v1/health',
    });
    return;
  }

  try {
    const apiHandler = await getApiHandler();
    await apiHandler(request, response);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: 'API_ENTRYPOINT_FAILED',
      detail: error instanceof Error ? error.message : 'Unknown entrypoint error',
      message: 'Digital Mandal API entrypoint could not start.',
    });
  }
}
